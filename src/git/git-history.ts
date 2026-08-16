import type { CommitSummary } from '../domain/changes.js'
import {
  CommitAuthoredAt,
  type RepoRelativePath,
  RepoRelativePath as Path,
  type Revision,
  Sha as Commit,
} from '../domain/semantic.js'
import { type GitCommand, splitNulSeparated } from './git-command.js'

export type CommitRange = {
  from: Revision | null
  to: Revision
}

const UNIT_SEPARATOR = '\u001f'
const COMMIT_FORMAT = '--format=%H%x1f%P%x1f%an%x1f%aI%x1f%s%x1f%b'

function toPaths(output: string, context: string): RepoRelativePath[] {
  return splitNulSeparated(output)
    .map((path) => Path.from(path, context))
    .toSorted()
}

export function formatRange(range: CommitRange): string {
  return range.from === null ? range.to : `${range.from}..${range.to}`
}

export function parseCommitRecords(output: string): CommitSummary[] {
  return splitNulSeparated(output).flatMap((record) => {
    const [sha, parents, author, authoredAt, subject, body] = record.split(UNIT_SEPARATOR)

    if (
      sha === undefined ||
      parents === undefined ||
      author === undefined ||
      authoredAt === undefined ||
      subject === undefined
    ) {
      return []
    }

    const context = 'git log'

    return [
      {
        sha: Commit.from(sha.trim(), context),
        subject,
        body: (body ?? '').replace(/\n+$/, ''),
        author,
        authoredAt: CommitAuthoredAt.from(authoredAt, context),
        parents:
          parents.length === 0
            ? []
            : parents.split(' ').map((parent) => Commit.from(parent, context)),
      },
    ]
  })
}

/**
 * Reads the commits in `(from, to]`, newest first. Records are NUL-terminated
 * and fields are separated by U+001F: commit bodies contain newlines, and a
 * line-splitting parser silently truncates every multi-paragraph message.
 */
export async function readCommits(git: GitCommand, range: CommitRange): Promise<CommitSummary[]> {
  const result = await git.runOrThrow(['log', '-z', COMMIT_FORMAT, formatRange(range)])
  return parseCommitRecords(result.stdout)
}

export async function readChangedFiles(
  git: GitCommand,
  range: CommitRange,
): Promise<RepoRelativePath[]> {
  if (range.from === null) {
    const tracked = await git.runOrThrow(['ls-tree', '-r', '--name-only', '-z', range.to])
    return toPaths(tracked.stdout, 'git ls-tree')
  }

  const result = await git.runOrThrow(['diff', '--name-only', '-z', `${range.from}..${range.to}`])
  return toPaths(result.stdout, 'git diff --name-only')
}
