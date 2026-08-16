import type { ReleasePlan } from '../domain/release-plan.js'
import type { RepositoryFingerprint } from '../domain/repository.js'
import type { Sha, StageName } from '../domain/index.js'
import type { JournalSession } from '../journal/storage.js'

export type ExecutionContext = {
  releaseCommitSha: Sha | null
}

export type StageCheck =
  | { kind: 'pending' }
  | { kind: 'complete'; details?: unknown; releaseCommitSha?: Sha }

export type StageWrite = Readonly<{
  details?: unknown
  releaseCommitSha?: Sha
}>

export type ExecutionStage = {
  check(plan: ReleasePlan, context: ExecutionContext): Promise<StageCheck>
  write(plan: ReleasePlan, context: ExecutionContext): Promise<StageWrite>
}

export type PublishStage = ExecutionStage & {
  writeWithOtp(plan: ReleasePlan, context: ExecutionContext, otp: string): Promise<StageWrite>
}

export type DryRunExecutor = {
  previewFileMutations(plan: ReleasePlan): Promise<unknown>
  inspectPackage(plan: ReleasePlan): Promise<unknown>
  publishDryRun(plan: ReleasePlan): Promise<unknown>
}

export type ExecutionJournal = {
  open(repositoryRoot: string): Promise<JournalSession>
}

export type ExecutionDependencies = {
  readFingerprint(plan: ReleasePlan): Promise<RepositoryFingerprint>
  stages: Record<Exclude<StageName, 'npm-publish'>, ExecutionStage>
  publish: PublishStage
  dryRun: DryRunExecutor
  journal: ExecutionJournal
}
