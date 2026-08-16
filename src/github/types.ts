import type { PullRequestSummary } from '../domain/changes.js'
import type { Sha } from '../domain/semantic.js'

export type GitHubRepositoryRef = {
  host: string
  owner: string
  repo: string
}

export type GitHubRepository = GitHubRepositoryRef & {
  defaultBranch: string
  canWriteContents: boolean
}

export type GitHubRelease = {
  id: number
  tag: string
  url: string
  draft: boolean
  prerelease: boolean
}

export type CreateGitHubReleaseRequest = {
  repository: GitHubRepositoryRef
  tag: string
  targetCommit: Sha
  title: string
  body: string
  draft: boolean
  prerelease: boolean
}

export type CreateGitHubReleaseResult =
  | { kind: 'created'; release: GitHubRelease }
  | { kind: 'existing'; release: GitHubRelease }

export type GitHubPullRequest = PullRequestSummary
