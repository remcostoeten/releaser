import { describe, expect, it, vi } from 'vitest'
import { GitHubApiError, GitHubAuthFailed } from '../../src/domain/errors.js'
import { createGitHubClient, type GitHubTransport } from '../../src/github/github-client.js'
import { createGitHubRelease } from '../../src/github/github-writer.js'
import { sha } from '../helpers/semantic.js'

type TransportCall = {
  route: string
  parameters: Record<string, unknown>
}

type Response = Awaited<ReturnType<GitHubTransport['request']>>

function apiFailure(status: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error(`GitHub returned ${status}`), {
    status,
    response: { status, headers },
  })
}

function releaseData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 42,
    tag_name: 'v1.2.0',
    html_url: 'https://github.com/example/tool/releases/tag/v1.2.0',
    draft: false,
    prerelease: false,
    ...overrides,
  }
}

function createQueueTransport(
  responses: Array<Response | Error>,
): GitHubTransport & { calls: TransportCall[] } {
  const calls: TransportCall[] = []
  return {
    calls,
    async request(route, parameters = {}): Promise<Response> {
      calls.push({ route, parameters })
      const response = responses.shift()
      if (response instanceof Error) {
        throw response
      }
      if (response === undefined) {
        throw new Error(`No response stubbed for ${route}`)
      }
      return response
    },
  }
}

const repository = { host: 'github.com', owner: 'example', repo: 'tool' }
const releaseRequest = {
  repository,
  tag: 'v1.2.0',
  targetCommit: sha('a'.repeat(40)),
  title: 'Release 1.2.0',
  body: 'Release notes',
  draft: false,
  prerelease: false,
}

describe('GitHub API reads', () => {
  it('normalizes repository permission and a release lookup', async () => {
    const transport = createQueueTransport([
      {
        status: 200,
        data: { default_branch: 'main', permissions: { push: true } },
      },
      { status: 200, data: releaseData() },
    ])
    const client = createGitHubClient('secret', { transport })

    await expect(client.readRepository(repository)).resolves.toEqual({
      ...repository,
      defaultBranch: 'main',
      canWriteContents: true,
    })
    await expect(client.readReleaseByTag(repository, 'v1.2.0')).resolves.toEqual({
      id: 42,
      tag: 'v1.2.0',
      url: 'https://github.com/example/tool/releases/tag/v1.2.0',
      draft: false,
      prerelease: false,
    })
  })

  it('normalizes merged pull requests associated with a commit', async () => {
    const transport = createQueueTransport([
      {
        status: 200,
        data: [
          {
            number: 12,
            title: 'feat: ship release notes',
            user: { login: 'octocat' },
            merged_at: '2026-01-03T12:00:00Z',
            merge_commit_sha: 'b'.repeat(40),
            labels: [{ name: 'feature' }, { name: 'release' }],
          },
          {
            number: 13,
            title: 'Still open',
            user: { login: 'octocat' },
            merged_at: null,
            merge_commit_sha: null,
            labels: [],
          },
        ],
      },
    ])
    const client = createGitHubClient('secret', { transport })

    await expect(client.readPullRequestsForCommit(repository, 'a'.repeat(40))).resolves.toEqual([
      {
        number: 12,
        title: 'feat: ship release notes',
        author: 'octocat',
        mergedAt: '2026-01-03T12:00:00Z',
        mergeCommitSha: 'b'.repeat(40),
        labels: ['feature', 'release'],
      },
    ])
    expect(transport.calls[0]).toEqual({
      route: 'GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls',
      parameters: {
        owner: 'example',
        repo: 'tool',
        commit_sha: 'a'.repeat(40),
        per_page: 100,
      },
    })
  })

  it('returns null when the repository or release does not exist', async () => {
    const transport = createQueueTransport([apiFailure(404), apiFailure(404)])
    const client = createGitHubClient('secret', { transport })

    await expect(client.readRepository(repository)).resolves.toBeNull()
    await expect(client.readReleaseByTag(repository, 'missing')).resolves.toBeNull()
  })

  it('distinguishes an invalid token', async () => {
    const transport = createQueueTransport([apiFailure(401)])
    const client = createGitHubClient('secret', { transport })
    await expect(client.readAuthenticatedLogin()).rejects.toBeInstanceOf(GitHubAuthFailed)
  })

  it('distinguishes an invalid token while resuming a release lookup', async () => {
    const transport = createQueueTransport([apiFailure(401)])
    const client = createGitHubClient('secret', { transport })

    await expect(client.readReleaseByTag(repository, 'v1.2.0')).rejects.toBeInstanceOf(
      GitHubAuthFailed,
    )
  })

  it('retries idempotent reads after 5xx and rate limits with bounded delays', async () => {
    const transport = createQueueTransport([
      apiFailure(503),
      apiFailure(403, { 'retry-after': '1', 'x-ratelimit-remaining': '0' }),
      { status: 200, data: { login: 'release-bot' } },
    ])
    const sleep = vi.fn(async () => undefined)
    const client = createGitHubClient('secret', { transport, sleep })

    await expect(client.readAuthenticatedLogin()).resolves.toBe('release-bot')
    expect(sleep).toHaveBeenNthCalledWith(1, 250)
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000)
  })

  it('surfaces a typed error after the read retry budget is exhausted', async () => {
    const transport = createQueueTransport([apiFailure(500), apiFailure(502), apiFailure(503)])
    const client = createGitHubClient('secret', {
      transport,
      sleep: async () => undefined,
    })
    await expect(client.readAuthenticatedLogin()).rejects.toBeInstanceOf(GitHubApiError)
  })
})

describe('GitHub release writes', () => {
  it('creates a normal release through the narrow write call', async () => {
    const transport = createQueueTransport([apiFailure(404), { status: 201, data: releaseData() }])
    const client = createGitHubClient('secret', { transport })

    await expect(createGitHubRelease(client, releaseRequest)).resolves.toMatchObject({
      kind: 'created',
      release: { tag: 'v1.2.0', draft: false, prerelease: false },
    })
    expect(transport.calls[1]).toEqual({
      route: 'POST /repos/{owner}/{repo}/releases',
      parameters: {
        owner: repository.owner,
        repo: repository.repo,
        tag_name: 'v1.2.0',
        target_commitish: 'a'.repeat(40),
        name: 'Release 1.2.0',
        body: 'Release notes',
        draft: false,
        prerelease: false,
      },
    })
  })

  it('passes draft and prerelease independently', async () => {
    const transport = createQueueTransport([
      apiFailure(404),
      { status: 201, data: releaseData({ draft: true, prerelease: true }) },
    ])
    const client = createGitHubClient('secret', { transport })
    await createGitHubRelease(client, { ...releaseRequest, draft: true, prerelease: true })

    expect(transport.calls[1]?.parameters).toMatchObject({ draft: true, prerelease: true })
  })

  it('skips creation when a release already exists', async () => {
    const transport = createQueueTransport([{ status: 200, data: releaseData() }])
    const client = createGitHubClient('secret', { transport })

    await expect(createGitHubRelease(client, releaseRequest)).resolves.toMatchObject({
      kind: 'existing',
    })
    expect(transport.calls).toHaveLength(1)
  })

  it('re-checks by tag after an uncertain create failure without retrying the write', async () => {
    const transport = createQueueTransport([
      apiFailure(404),
      apiFailure(503),
      { status: 200, data: releaseData() },
    ])
    const client = createGitHubClient('secret', { transport })

    await expect(createGitHubRelease(client, releaseRequest)).resolves.toMatchObject({
      kind: 'existing',
    })
    expect(transport.calls.filter((call) => call.route.startsWith('POST'))).toHaveLength(1)
  })
})
