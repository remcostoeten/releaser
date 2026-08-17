import type { VersionPatternConfig } from '../config/schema.js'
import type { FileMutation } from '../domain/mutations.js'
import type { RepoRelativePath, SemVer } from '../domain/semantic.js'

export type { VersionPatternConfig }

export type VersionMatch =
  | { kind: 'found'; value: string; offset: number; length: number }
  | { kind: 'missing' }
  | { kind: 'ambiguous'; count: number }

function iterationFlags(flags: string): string {
  return [...new Set([...flags, 'd', 'g'])].join('')
}

/**
 * Locates the version inside a non-JSON version file. The first capture group
 * of the configured pattern is the version; the pattern must match exactly
 * once, because a second match makes the source of truth ambiguous.
 */
export function matchVersion(source: string, pattern: VersionPatternConfig): VersionMatch {
  const regex = new RegExp(pattern.pattern, iterationFlags(pattern.flags))
  const matches = [...source.matchAll(regex)]

  if (matches.length === 0) {
    return { kind: 'missing' }
  }
  if (matches.length > 1) {
    return { kind: 'ambiguous', count: matches.length }
  }

  const match = matches[0]
  const span = match?.indices?.[1]
  const value = match?.[1]

  if (span === undefined || value === undefined) {
    return { kind: 'missing' }
  }

  return { kind: 'found', value, offset: span[0], length: span[1] - span[0] }
}

export function describeVersionMatchFailure(
  match: Exclude<VersionMatch, { kind: 'found' }>,
  path: string,
  pattern: VersionPatternConfig,
): string {
  return match.kind === 'missing'
    ? `${path} has no version matching /${pattern.pattern}/${pattern.flags}`
    : `${path} matches /${pattern.pattern}/${pattern.flags} ${match.count} times; it must match exactly once`
}

export function planPatternVersion(
  source: string,
  previousVersion: SemVer,
  nextVersion: SemVer,
  path: RepoRelativePath,
  pattern: VersionPatternConfig,
): FileMutation {
  const match = matchVersion(source, pattern)

  if (match.kind !== 'found') {
    throw new TypeError(describeVersionMatchFailure(match, path, pattern))
  }

  const edit = Object.freeze({
    offset: match.offset,
    deletedText: source.slice(match.offset, match.offset + match.length),
    insertedText: nextVersion,
  })

  return Object.freeze({
    kind: 'manifest-version',
    path,
    previousVersion,
    nextVersion,
    edits: Object.freeze([edit]),
  })
}
