import { Octokit } from 'octokit'
import { GitHubApiError, GitHubAuthFailed } from '../domain/errors.js'
import { PullRequestMergedAt, Sha } from '../domain/semantic.js'
import type {
  CreateGitHubReleaseRequest,
  GitHubRelease,
  GitHubPullRequest,
  GitHubRepository,
  GitHubRepositoryRef,
  GitHubWorkflowRun,
} from './types.js'

type GitHubResponse = {
  status: number
  data: unknown
  headers?: Record<string, string | number | undefined>
}

export type GitHubTransport = {
  request(route: string, parameters?: Record<string, unknown>): Promise<GitHubResponse>
}

export type GitHubClientOptions = {
  baseUrl?: string
  maxReadAttempts?: number
  sleep?: (milliseconds: number) => Promise<void>
  transport?: GitHubTransport
}

export type GitHubClient = {
  readAuthenticatedLogin(): Promise<string>
  readRepository(repository: GitHubRepositoryRef): Promise<GitHubRepository | null>
  readReleaseByTag(repository: GitHubRepositoryRef, tag: string): Promise<GitHubRelease | null>
  readPullRequestsForCommit(
    repository: GitHubRepositoryRef,
    commitSha: string,
  ): Promise<GitHubPullRequest[]>
  findReleaseByTag(repository: GitHubRepositoryRef, tag: string): Promise<GitHubRelease | null>
  readWorkflowRunsForRef(repository: GitHubRepositoryRef, ref: string): Promise<GitHubWorkflowRun[]>
  createRelease(request: CreateGitHubReleaseRequest): Promise<GitHubRelease>
  publishRelease(repository: GitHubRepositoryRef, releaseId: number): Promise<GitHubRelease>
}

type ApiFailure = Error & {
  status?: number
  response?: {
    status?: number
    data?: unknown
    headers?: Record<string, string | number | undefined>
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function statusOf(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null
  }
  const failure = error as ApiFailure
  return failure.status ?? failure.response?.status ?? null
}

function headersOf(error: unknown): Record<string, string | number | undefined> {
  if (!(error instanceof Error)) {
    return {}
  }
  return (error as ApiFailure).response?.headers ?? {}
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown GitHub API failure'
}

function retryDelay(error: unknown, attempt: number): number | null {
  const status = statusOf(error)
  const headers = headersOf(error)
  const retryAfter = Number(headers['retry-after'])
  const rateLimited = status === 429 || (status === 403 && headers['x-ratelimit-remaining'] === '0')

  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1_000, 5_000)
  }
  if (rateLimited || (status !== null && status >= 500)) {
    return Math.min(250 * 2 ** attempt, 2_000)
  }
  return null
}

function apiError(error: unknown): GitHubApiError | GitHubAuthFailed {
  if (statusOf(error) === 401) {
    return new GitHubAuthFailed('invalid')
  }
  return new GitHubApiError(messageOf(error), statusOf(error) ?? 0)
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function booleanValue(value: unknown): boolean {
  return value === true
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function normalizeRelease(value: unknown): GitHubRelease {
  const data = record(value)
  return {
    id: numberValue(data.id),
    tag: stringValue(data.tag_name),
    url: stringValue(data.html_url),
    draft: booleanValue(data.draft),
    prerelease: booleanValue(data.prerelease),
  }
}

function normalizeWorkflowRun(value: unknown): GitHubWorkflowRun {
  const data = record(value)
  const conclusion = stringValue(data.conclusion)
  return {
    id: numberValue(data.id),
    name: stringValue(data.name),
    status: stringValue(data.status),
    conclusion: conclusion.length === 0 ? null : conclusion,
  }
}

function normalizePullRequest(value: unknown): GitHubPullRequest | null {
  const data = record(value)
  const mergedAt = stringValue(data.merged_at)
  const number = numberValue(data.number)

  if (mergedAt.length === 0 || number <= 0) {
    return null
  }

  const user = record(data.user)
  const labels = Array.isArray(data.labels)
    ? data.labels
        .map((label) => stringValue(record(label).name))
        .filter((label) => label.length > 0)
    : []
  const mergeCommitSha = stringValue(data.merge_commit_sha)

  return {
    number,
    title: stringValue(data.title),
    author: stringValue(user.login),
    mergedAt: PullRequestMergedAt.from(mergedAt, `GitHub pull request #${number}`),
    mergeCommitSha:
      mergeCommitSha.length === 0
        ? null
        : Sha.from(mergeCommitSha, `GitHub pull request #${number}`),
    labels: labels.toSorted((left, right) => left.localeCompare(right)),
  }
}

function createOctokitTransport(token: string, baseUrl?: string): GitHubTransport {
  const octokit = new Octokit({ auth: token, ...(baseUrl === undefined ? {} : { baseUrl }) })
  return {
    async request(route, parameters): Promise<GitHubResponse> {
      return octokit.request(route, parameters)
    },
  }
}

export function createGitHubClient(token: string, options: GitHubClientOptions = {}): GitHubClient {
  const transport = options.transport ?? createOctokitTransport(token, options.baseUrl)
  const maxReadAttempts = options.maxReadAttempts ?? 3
  const sleep = options.sleep ?? defaultSleep

  async function readAttempt(
    route: string,
    parameters: Record<string, unknown>,
    attempt: number,
  ): Promise<GitHubResponse> {
    try {
      return await transport.request(route, parameters)
    } catch (error) {
      const delay = retryDelay(error, attempt)
      if (delay === null || attempt === maxReadAttempts - 1) {
        throw error
      }
      await sleep(delay)
      return readAttempt(route, parameters, attempt + 1)
    }
  }

  function read(route: string, parameters: Record<string, unknown> = {}): Promise<GitHubResponse> {
    return readAttempt(route, parameters, 0)
  }

  return {
    async readAuthenticatedLogin(): Promise<string> {
      try {
        const response = await read('GET /user')
        return stringValue(record(response.data).login)
      } catch (error) {
        if (statusOf(error) === 401) {
          throw new GitHubAuthFailed('invalid')
        }
        throw apiError(error)
      }
    },
    async readRepository(repository): Promise<GitHubRepository | null> {
      try {
        const response = await read('GET /repos/{owner}/{repo}', {
          owner: repository.owner,
          repo: repository.repo,
        })
        const data = record(response.data)
        const permissions = record(data.permissions)
        return {
          ...repository,
          defaultBranch: stringValue(data.default_branch),
          canWriteContents:
            booleanValue(permissions.push) ||
            booleanValue(permissions.maintain) ||
            booleanValue(permissions.admin),
        }
      } catch (error) {
        if (statusOf(error) === 404) {
          return null
        }
        if (statusOf(error) === 401) {
          throw new GitHubAuthFailed('invalid')
        }
        throw apiError(error)
      }
    },
    async readReleaseByTag(repository, tag): Promise<GitHubRelease | null> {
      try {
        const response = await read('GET /repos/{owner}/{repo}/releases/tags/{tag}', {
          owner: repository.owner,
          repo: repository.repo,
          tag,
        })
        return normalizeRelease(response.data)
      } catch (error) {
        if (statusOf(error) === 404) {
          return null
        }
        throw apiError(error)
      }
    },
    async readPullRequestsForCommit(repository, commitSha): Promise<GitHubPullRequest[]> {
      try {
        const response = await read('GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls', {
          owner: repository.owner,
          repo: repository.repo,
          commit_sha: commitSha,
          per_page: 100,
        })
        if (!Array.isArray(response.data)) {
          return []
        }
        return response.data.flatMap((pullRequest) => {
          const normalized = normalizePullRequest(pullRequest)
          return normalized === null ? [] : [normalized]
        })
      } catch (error) {
        throw apiError(error)
      }
    },
    // The by-tag endpoint only returns published releases; a draft is not
    // associated with its tag until publication, so drafts require listing.
    async findReleaseByTag(repository, tag): Promise<GitHubRelease | null> {
      try {
        const response = await read('GET /repos/{owner}/{repo}/releases', {
          owner: repository.owner,
          repo: repository.repo,
          per_page: 100,
        })
        if (!Array.isArray(response.data)) {
          return null
        }
        const match = response.data.map(normalizeRelease).find((release) => release.tag === tag)
        return match ?? null
      } catch (error) {
        throw apiError(error)
      }
    },
    async readWorkflowRunsForRef(repository, ref): Promise<GitHubWorkflowRun[]> {
      try {
        // The branch filter also matches tag refs on tag-push runs.
        const response = await read('GET /repos/{owner}/{repo}/actions/runs', {
          owner: repository.owner,
          repo: repository.repo,
          branch: ref,
          per_page: 100,
        })
        const runs = record(response.data).workflow_runs
        return Array.isArray(runs) ? runs.map(normalizeWorkflowRun) : []
      } catch (error) {
        throw apiError(error)
      }
    },
    async createRelease(request): Promise<GitHubRelease> {
      try {
        const response = await transport.request('POST /repos/{owner}/{repo}/releases', {
          owner: request.repository.owner,
          repo: request.repository.repo,
          tag_name: request.tag,
          target_commitish: request.targetCommit,
          name: request.title,
          body: request.body,
          draft: request.draft,
          prerelease: request.prerelease,
        })
        return normalizeRelease(response.data)
      } catch (error) {
        throw apiError(error)
      }
    },
    async publishRelease(repository, releaseId): Promise<GitHubRelease> {
      try {
        const response = await transport.request(
          'PATCH /repos/{owner}/{repo}/releases/{release_id}',
          {
            owner: repository.owner,
            repo: repository.repo,
            release_id: releaseId,
            draft: false,
          },
        )
        return normalizeRelease(response.data)
      } catch (error) {
        throw apiError(error)
      }
    },
  }
}
