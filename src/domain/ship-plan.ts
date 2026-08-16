import type { AbsolutePath, BranchName, Digest, Sha } from './semantic.js'

export type ShipTargetState = 'missing' | 'synchronized' | 'behind' | 'ahead'

export type ShipPlan = Readonly<{
  repositoryRoot: AbsolutePath
  remote: string
  sourceBranch: BranchName
  targetBranch: BranchName
  sourceHeadSha: Sha
  sourceStatusDigest: Digest
  targetLocalSha: Sha | null
  targetRemoteSha: Sha
  targetState: ShipTargetState
  changes: readonly string[]
  featureCommit:
    | Readonly<{ kind: 'create'; message: string }>
    | Readonly<{ kind: 'skip'; reason: string }>
  mergeMessage: string
}>

export type ShipResult = Readonly<{
  featureCommitSha: Sha
  mergeCommitSha: Sha
  targetBranch: BranchName
}>
