import type { CommitSummary } from '../domain/changes.js'
import { type GitCommand, splitNulSeparated } from './git-command.js'

export type CommitRange = {
  from: string | null
  to: string
}

const UNIT_SEPARATOR = '\u001f'
const COMMIT_FORMAT = '--format=%H%x1f%P%x1f%an%x1f%aI%x1f%s%x1f%b'

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

    return [
      {
        sha: sha.trim(),
        subject,
        body: (body ?? '').replace(/\n+$/, ''),
        author,
        authoredAt,
        parents: parents.length === 0 ? [] : parents.split(' '),
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

export async function readChangedFiles(git: GitCommand, range: CommitRange): Promise<string[]> {
  if (range.from === null) {
    const tracked = await git.runOrThrow(['ls-tree', '-r', '--name-only', '-z', range.to])
    return splitNulSeparated(tracked.stdout).toSorted()
  }

  const result = await git.runOrThrow(['diff', '--name-only', '-z', `${range.from}..${range.to}`])
  return splitNulSeparated(result.stdout).toSorted()
}
