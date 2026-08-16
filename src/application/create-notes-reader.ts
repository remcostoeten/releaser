import type { CommitSummary, PullRequestSummary } from '../domain/changes.js'
import type { ReleaseBoundary } from '../domain/repository.js'
import type { Sha } from '../domain/semantic.js'
import { collectReleaseNotes } from '../notes/collect.js'
import type { GitHubRepositoryRef, NotesReader } from './ports.js'

export type ReleaseNotesSources = {
  readCommits(boundary: ReleaseBoundary): Promise<CommitSummary[]>
  readPullRequests(
    repository: GitHubRepositoryRef,
    commitShas: readonly Sha[],
  ): Promise<PullRequestSummary[]>
}

export function createNotesReader(sources: ReleaseNotesSources): NotesReader {
  return {
    async collect(request) {
      const commits = await sources.readCommits(request.boundary)
      const pullRequests =
        request.includePullRequests && request.githubRepository !== null
          ? await sources.readPullRequests(
              request.githubRepository,
              commits.map((commit) => commit.sha),
            )
          : []

      return collectReleaseNotes({
        version: request.version,
        previousVersion: request.previousVersion,
        commits,
        pullRequests,
      })
    },
  }
}
