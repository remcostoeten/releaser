import { describe, expect, it } from 'vitest'
import { createGitHubReader } from '../../src/github/github-reader.js'
import { resolveGitHubToken, resolveGitHubTokenWithGh } from '../../src/github/token.js'
import { createFakeCommandRunner } from '../helpers/fake-command-runner.js'

function repositoryReader(host = 'github.com') {
  return {
    async readRemoteRepository() {
      return { host, owner: 'example', repo: 'tool' }
    },
  }
}

describe('GitHub token resolution', () => {
  it('prefers GITHUB_TOKEN, then GH_TOKEN', () => {
    expect(resolveGitHubToken({ GITHUB_TOKEN: 'github-token', GH_TOKEN: 'gh-token' })).toEqual({
      value: 'github-token',
      source: 'GITHUB_TOKEN',
    })
    expect(resolveGitHubToken({ GH_TOKEN: 'gh-token' })).toEqual({
      value: 'gh-token',
      source: 'GH_TOKEN',
    })
  })

  it('uses an authenticated GitHub CLI session when environment tokens are absent', async () => {
    const runner = createFakeCommandRunner()
    runner.stub('gh auth token', { stdout: 'cli-token\n' })

    await expect(resolveGitHubTokenWithGh(runner, {})).resolves.toEqual({
      value: 'cli-token',
      source: 'gh',
    })
    expect(runner.commandLines()).toEqual(['gh auth token'])
  })

  it('does not invoke GitHub CLI when an environment token exists', async () => {
    const runner = createFakeCommandRunner()

    await expect(
      resolveGitHubTokenWithGh(runner, { GH_TOKEN: 'environment-token' }),
    ).resolves.toEqual({ value: 'environment-token', source: 'GH_TOKEN' })
    expect(runner.calls).toEqual([])
  })

  it('returns absent when GitHub CLI has no authenticated session', async () => {
    const runner = createFakeCommandRunner()
    runner.stub('gh auth token', { exitCode: 1, stderr: 'not logged in' })

    await expect(resolveGitHubTokenWithGh(runner, {})).resolves.toBeNull()
  })

  it('reports an absent token without making an API call', async () => {
    const github = createGitHubReader(repositoryReader(), {
      environment: {},
      transport: {
        async request(): Promise<never> {
          throw new Error('API must not be called')
        },
      },
    })

    await expect(github.readTokenStatus(null)).resolves.toEqual({ kind: 'absent' })
  })

  it('resolves the origin and reports valid write permission', async () => {
    const responses = [
      { status: 200, data: { login: 'release-bot' } },
      { status: 200, data: { default_branch: 'main', permissions: { push: true } } },
    ]
    const github = createGitHubReader(repositoryReader(), {
      environment: { GITHUB_TOKEN: 'secret' },
      transport: {
        async request() {
          const response = responses.shift()
          if (response === undefined) {
            throw new Error('Unexpected request')
          }
          return response
        },
      },
    })

    const resolved = await github.resolveRepository('origin')
    expect(resolved).toEqual({ owner: 'example', repo: 'tool' })
    await expect(github.readTokenStatus(resolved)).resolves.toEqual({
      kind: 'valid',
      login: 'release-bot',
      canWrite: true,
    })
  })

  it('distinguishes invalid credentials from insufficient permission', async () => {
    const invalid = createGitHubReader(repositoryReader(), {
      environment: { GITHUB_TOKEN: 'invalid' },
      transport: {
        async request(): Promise<never> {
          throw Object.assign(new Error('Bad credentials'), { status: 401 })
        },
      },
    })
    await expect(invalid.readTokenStatus({ owner: 'example', repo: 'tool' })).resolves.toEqual({
      kind: 'invalid',
      reason: 'GitHub rejected the configured token',
    })

    const responses = [
      { status: 200, data: { login: 'release-bot' } },
      { status: 200, data: { default_branch: 'main', permissions: { push: false } } },
    ]
    const limited = createGitHubReader(repositoryReader(), {
      environment: { GH_TOKEN: 'limited' },
      transport: {
        async request() {
          const response = responses.shift()
          if (response === undefined) {
            throw new Error('Unexpected request')
          }
          return response
        },
      },
    })
    await expect(limited.readTokenStatus({ owner: 'example', repo: 'tool' })).resolves.toEqual({
      kind: 'valid',
      login: 'release-bot',
      canWrite: false,
    })
  })
})
