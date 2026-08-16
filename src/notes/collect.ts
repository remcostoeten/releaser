import {
  CHANGE_CATEGORIES,
  type Change,
  type CommitSummary,
  type PullRequestSummary,
} from '../domain/changes.js'
import type { ReleaseNotes } from '../domain/release-notes.js'
import { ChangeId, type SemVer, type Sha } from '../domain/semantic.js'
import { categorizeChange } from './categorize.js'

export type CollectReleaseNotesRequest = {
  version: SemVer
  previousVersion: SemVer | null
  commits: readonly CommitSummary[]
  pullRequests: readonly PullRequestSummary[]
}

function normalizedTitle(title: string): string {
  return title.replaceAll(/\s+/gu, ' ').trim()
}

function pullRequestChange(pullRequest: PullRequestSummary): Change {
  const title = normalizedTitle(pullRequest.title)
  return {
    id: ChangeId.from(`pr-${pullRequest.number}`, `pull request #${pullRequest.number}`),
    title,
    category: categorizeChange(title, '', pullRequest.labels),
    author: pullRequest.author.length === 0 ? null : pullRequest.author,
    origin: {
      kind: 'pull-request',
      number: pullRequest.number,
      mergeCommitSha: pullRequest.mergeCommitSha,
    },
  }
}

function commitChange(commit: CommitSummary): Change {
  const title = normalizedTitle(commit.subject)
  return {
    id: ChangeId.from(`commit-${commit.sha}`, `commit ${commit.sha}`),
    title,
    category: categorizeChange(title, commit.body, []),
    author: commit.author.length === 0 ? null : commit.author,
    origin: { kind: 'commit', sha: commit.sha },
  }
}

function uniquePullRequests(pullRequests: readonly PullRequestSummary[]): PullRequestSummary[] {
  return [
    ...new Map(
      pullRequests
        .toSorted((left, right) => left.number - right.number)
        .map((pullRequest) => [pullRequest.number, pullRequest]),
    ).values(),
  ]
}

function compareChanges(left: Change, right: Change): number {
  if (left.origin.kind === 'pull-request' && right.origin.kind === 'pull-request') {
    return right.origin.number - left.origin.number
  }
  if (left.origin.kind !== right.origin.kind) {
    return left.origin.kind === 'pull-request' ? -1 : 1
  }
  return left.id.localeCompare(right.id)
}

export function collectReleaseNotes(request: CollectReleaseNotesRequest): ReleaseNotes {
  const pullRequests = uniquePullRequests(request.pullRequests)
  const representedCommits = new Set<Sha>(
    pullRequests.flatMap((pullRequest) =>
      pullRequest.mergeCommitSha === null ? [] : [pullRequest.mergeCommitSha],
    ),
  )
  const changes = [
    ...pullRequests.map((pullRequest) => pullRequestChange(pullRequest)),
    ...request.commits
      .filter((commit) => !representedCommits.has(commit.sha))
      .map((commit) => commitChange(commit)),
  ]

  return {
    version: request.version,
    previousVersion: request.previousVersion,
    sections: CHANGE_CATEGORIES.flatMap((category) => {
      const categorized = changes
        .filter((change) => change.category === category)
        .toSorted(compareChanges)
      return categorized.length === 0 ? [] : [{ category, changes: categorized }]
    }),
  }
}
