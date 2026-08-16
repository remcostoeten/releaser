import { GitHubApiError } from '../domain/errors.js'
import type { GitHubClient } from './github-client.js'
import type { CreateGitHubReleaseRequest, CreateGitHubReleaseResult } from './types.js'

export async function createGitHubRelease(
  client: GitHubClient,
  request: CreateGitHubReleaseRequest,
): Promise<CreateGitHubReleaseResult> {
  const existing = await client.readReleaseByTag(request.repository, request.tag)
  if (existing !== null) {
    return { kind: 'existing', release: existing }
  }

  try {
    return { kind: 'created', release: await client.createRelease(request) }
  } catch (error) {
    const status =
      error instanceof GitHubApiError
        ? ((error.details as { status?: number } | undefined)?.status ?? 0)
        : 0
    if (!(error instanceof GitHubApiError) || (status < 500 && status !== 403 && status !== 429)) {
      throw error
    }
    const release = await client.readReleaseByTag(request.repository, request.tag)
    if (release !== null) {
      return { kind: 'existing', release }
    }
    throw error
  }
}
