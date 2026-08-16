import type { GitHubReader, GitHubRepositoryRef, GitHubTokenStatus } from '../application/ports.js'
import { GitHubAuthFailed } from '../domain/errors.js'
import type { RemoteRepository } from '../git/remote-url.js'
import { createGitHubClient, type GitHubClientOptions } from './github-client.js'
import { resolveGitHubToken, type GitHubToken } from './token.js'

export type RemoteRepositoryReader = {
  readRemoteRepository(): Promise<RemoteRepository | null>
}

export type GitHubReaderOptions = GitHubClientOptions & {
  environment?: NodeJS.ProcessEnv
  token?: GitHubToken | null
}

async function readPullRequestsInBatches(
  client: ReturnType<typeof createGitHubClient>,
  repository: { host: string; owner: string; repo: string },
  commitShas: readonly string[],
  offset = 0,
): Promise<Awaited<ReturnType<typeof client.readPullRequestsForCommit>>> {
  const batch = commitShas.slice(offset, offset + 8)
  if (batch.length === 0) {
    return []
  }

  const pullRequests = (
    await Promise.all(
      batch.map((commitSha) => client.readPullRequestsForCommit(repository, commitSha)),
    )
  ).flat()
  return [
    ...pullRequests,
    ...(await readPullRequestsInBatches(client, repository, commitShas, offset + batch.length)),
  ]
}

export function createGitHubReader(
  repositoryReader: RemoteRepositoryReader,
  options: GitHubReaderOptions = {},
): GitHubReader {
  let resolvedRepository: GitHubRepositoryRef | null = null
  let resolvedRemote: RemoteRepository | null = null
  let authenticatedClient: ReturnType<typeof createGitHubClient> | null = null

  function clientForResolvedRemote() {
    if (authenticatedClient !== null) {
      return authenticatedClient
    }
    const token =
      options.token === undefined ? resolveGitHubToken(options.environment) : options.token
    if (token === null) {
      return null
    }
    const enterpriseBaseUrl =
      resolvedRemote === null || resolvedRemote.host === 'github.com'
        ? undefined
        : `https://${resolvedRemote.host}/api/v3`
    const baseUrl = options.baseUrl ?? enterpriseBaseUrl
    authenticatedClient = createGitHubClient(token.value, {
      ...options,
      ...(baseUrl === undefined ? {} : { baseUrl }),
    })
    return authenticatedClient
  }

  return {
    async resolveRepository(): Promise<GitHubRepositoryRef | null> {
      const remote = await repositoryReader.readRemoteRepository()
      resolvedRemote = remote
      resolvedRepository = remote === null ? null : { owner: remote.owner, repo: remote.repo }
      return resolvedRepository
    },
    async readTokenStatus(repository): Promise<GitHubTokenStatus> {
      const client = clientForResolvedRemote()
      if (client === null) {
        return { kind: 'absent' }
      }
      try {
        const login = await client.readAuthenticatedLogin()
        const target = repository ?? resolvedRepository
        if (target === null) {
          return { kind: 'valid', login, canWrite: false }
        }
        const found = await client.readRepository({
          host: resolvedRemote?.host ?? 'github.com',
          ...target,
        })
        return { kind: 'valid', login, canWrite: found?.canWriteContents ?? false }
      } catch (error) {
        if (error instanceof GitHubAuthFailed) {
          return { kind: 'invalid', reason: error.message }
        }
        throw error
      }
    },
    async readMergedPullRequests(repository, commitShas) {
      const client = clientForResolvedRemote()
      if (client === null) {
        return []
      }

      const pullRequests = await readPullRequestsInBatches(
        client,
        { host: resolvedRemote?.host ?? 'github.com', ...repository },
        commitShas,
      )

      return [
        ...new Map(pullRequests.map((pullRequest) => [pullRequest.number, pullRequest])).values(),
      ].toSorted((left, right) =>
        right.mergedAt === left.mergedAt
          ? right.number - left.number
          : right.mergedAt.localeCompare(left.mergedAt),
      )
    },
  }
}
