import type { CommandRunner } from '../shared/command-runner.js'
import { noop } from '../shared/noop.js'
import { defaultRedactor } from '../shared/redaction.js'

export type GitHubToken = {
  value: string
  source: 'GITHUB_TOKEN' | 'GH_TOKEN' | 'gh'
}

function tokenFromEnvironment(environment: NodeJS.ProcessEnv): GitHubToken | null {
  const githubToken = environment.GITHUB_TOKEN?.trim()
  if (githubToken) {
    return { value: githubToken, source: 'GITHUB_TOKEN' }
  }

  const ghToken = environment.GH_TOKEN?.trim()
  return ghToken ? { value: ghToken, source: 'GH_TOKEN' } : null
}

export function resolveGitHubToken(
  environment: NodeJS.ProcessEnv = process.env,
): GitHubToken | null {
  return tokenFromEnvironment(environment)
}

export async function resolveGitHubTokenWithGh(
  runner: CommandRunner,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<GitHubToken | null> {
  const environmentToken = tokenFromEnvironment(environment)
  if (environmentToken !== null) {
    defaultRedactor.registerSecret(environmentToken.value)
    return environmentToken
  }

  try {
    const value = await runner.readSecret('gh', ['auth', 'token'])
    if (value === null) {
      return null
    }
    defaultRedactor.registerSecret(value)
    return { value, source: 'gh' }
  } catch {
    noop()
    return null
  }
}
