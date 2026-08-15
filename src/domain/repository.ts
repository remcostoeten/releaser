export type UpstreamState =
  | { kind: 'none' }
  | {
      kind: 'tracked'
      remote: string
      ref: string
      sha: string
      ahead: number
      behind: number
    }

export type HeadState =
  | { kind: 'branch'; branch: string; sha: string; upstream: UpstreamState }
  | { kind: 'detached'; sha: string }

export type WorkingTreeState = { kind: 'clean' } | { kind: 'dirty'; entries: string[] }

export type RepositoryState = {
  root: string
  head: HeadState
  workingTree: WorkingTreeState
  statusDigest: string
  remotes: string[]
  defaultBranch: string | null
}

export type RepositoryFingerprint = {
  headSha: string
  statusDigest: string
  manifestVersion: string
  upstreamSha: string | null
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

export function headSha(head: HeadState): string {
  return head.sha
}

export function upstreamSha(head: HeadState): string | null {
  if (head.kind === 'detached' || head.upstream.kind === 'none') {
    return null
  }
  return head.upstream.sha
}

export function fingerprintRepository(
  state: RepositoryState,
  manifestVersion: string,
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
  | { kind: 'initial'; headSha: string }
  | {
      kind: 'since-release'
      previousRef: string
      previousSha: string
      previousVersion: string
      headSha: string
    }
