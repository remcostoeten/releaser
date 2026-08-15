import type { AbsolutePath, BranchName, Digest, Ref, SemVer, Sha, TagName } from './semantic.js'

export type UpstreamState =
  | { kind: 'none' }
  | {
      kind: 'tracked'
      remote: string
      ref: Ref
      sha: Sha
      ahead: number
      behind: number
    }

export type HeadState =
  | { kind: 'branch'; branch: BranchName; sha: Sha; upstream: UpstreamState }
  | { kind: 'detached'; sha: Sha }

export type WorkingTreeState = { kind: 'clean' } | { kind: 'dirty'; entries: string[] }

export type RepositoryState = {
  root: AbsolutePath
  head: HeadState
  workingTree: WorkingTreeState
  statusDigest: Digest
  remotes: string[]
  defaultBranch: BranchName | null
}

export type RepositoryFingerprint = {
  headSha: Sha
  statusDigest: Digest
  manifestVersion: SemVer
  upstreamSha: Sha | null
}

export type FingerprintField = keyof RepositoryFingerprint

export type FingerprintMismatch = {
  field: FingerprintField
  expected: string | null
  actual: string | null
}

const FINGERPRINT_FIELDS: FingerprintField[] = [
  'headSha',
  'statusDigest',
  'manifestVersion',
  'upstreamSha',
]

export function headSha(head: HeadState): Sha {
  return head.sha
}

export function upstreamSha(head: HeadState): Sha | null {
  if (head.kind === 'detached' || head.upstream.kind === 'none') {
    return null
  }
  return head.upstream.sha
}

export function fingerprintRepository(
  state: RepositoryState,
  manifestVersion: SemVer,
): RepositoryFingerprint {
  return {
    headSha: headSha(state.head),
    statusDigest: state.statusDigest,
    manifestVersion,
    upstreamSha: upstreamSha(state.head),
  }
}

export function compareFingerprints(
  expected: RepositoryFingerprint,
  actual: RepositoryFingerprint,
): FingerprintMismatch[] {
  const mismatches: FingerprintMismatch[] = []

  for (const field of FINGERPRINT_FIELDS) {
    if (expected[field] !== actual[field]) {
      mismatches.push({ field, expected: expected[field], actual: actual[field] })
    }
  }

  return mismatches
}

export function fingerprintsMatch(
  expected: RepositoryFingerprint,
  actual: RepositoryFingerprint,
): boolean {
  return compareFingerprints(expected, actual).length === 0
}

export type ReleaseBoundary =
  | { kind: 'initial'; headSha: Sha }
  | {
      kind: 'since-release'
      previousRef: TagName
      previousSha: Sha
      previousVersion: SemVer
      headSha: Sha
    }
