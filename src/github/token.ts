export type GitHubToken = {
  value: string
  source: 'GITHUB_TOKEN' | 'GH_TOKEN'
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
