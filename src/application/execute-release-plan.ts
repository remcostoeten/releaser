import { LifecycleScriptFailed, OtpRequired, PartialRelease, StalePlan } from '../domain/errors.js'
import { planStages, type ReleasePlan } from '../domain/release-plan.js'
import { compareFingerprints } from '../domain/repository.js'
import { STAGE_ORDER, type StageName } from '../domain/stages.js'
import type { JournalSession } from '../journal/storage.js'
import type { JournalEntry, ReleaseJournal } from '../journal/types.js'
import { noop } from '../shared/noop.js'
import type {
  ExecutionContext,
  ExecutionDependencies,
  ExecutionStage,
  StageCheck,
  StageWrite,
} from './execution-ports.js'

export type ExecuteReleasePlanOptions = {
  dryRun?: boolean
  interactive?: boolean
  otp?: string
  requestOtp?: () => Promise<string | null>
  afterStage?: (stage: StageName) => Promise<void>
  onEvent?: (event: ExecutionEvent) => void | Promise<void>
}

export type ExecutionEvent =
  | Readonly<{ kind: 'stage-started'; stage: StageName }>
  | Readonly<{
      kind: 'stage-skipped'
      stage: StageName
      reason: string
      verification: 'disabled' | 'already-complete' | 'dry-run'
    }>
  | Readonly<{ kind: 'publish-outcome-unknown'; stage: 'npm-publish' }>
  | Readonly<{ kind: 'stage-succeeded'; stage: StageName; reason?: string }>
  | Readonly<{ kind: 'stage-failed'; stage: StageName; reason?: string }>
  | Readonly<{ kind: 'release-completed' }>
  | Readonly<{ kind: 'dry-run-completed' }>

export type ExecutedStage = Readonly<{
  stage: StageName
  outcome: 'succeeded' | 'skipped'
  details?: unknown
}>

export type ExecuteReleasePlanResult =
  | { kind: 'dry-run'; fileDiff: unknown; packageInspection: unknown; publishInspection: unknown }
  | { kind: 'completed'; stages: readonly ExecutedStage[]; journalPath: string }

type RunState = {
  journal: JournalSession
  context: ExecutionContext
  results: ExecutedStage[]
  npmPublished: boolean
}

function isPlanStage(plan: ReleasePlan, stage: StageName): boolean {
  return planStages(plan).includes(stage)
}

function disabledStageReason(plan: ReleasePlan, stage: StageName): string {
  if (stage === 'npm-publish' && plan.npmPublish.kind === 'skipped') {
    return plan.npmPublish.reason
  }
  if (stage === 'github-release' && plan.githubRelease.kind === 'skipped') {
    return plan.githubRelease.reason
  }
  return 'disabled by plan'
}

function updateContext(context: ExecutionContext, value: StageCheck | StageWrite): void {
  if ('releaseCommitSha' in value && value.releaseCommitSha !== undefined) {
    context.releaseCommitSha = value.releaseCommitSha
  }
}

function latestOutcome(journal: ReleaseJournal, stage: StageName): JournalEntry['outcome'] | null {
  return journal.entries.findLast((entry) => entry.stage === stage)?.outcome ?? null
}

function completedStages(results: readonly ExecutedStage[]): StageName[] {
  return results.filter((result) => result.outcome === 'succeeded').map((result) => result.stage)
}

function remainingStages(plan: ReleasePlan, failedStage: StageName): StageName[] {
  const planned = planStages(plan)
  return planned.slice(planned.indexOf(failedStage) + 1)
}

function detailReason(details: unknown, fallback: string): string {
  if (
    typeof details === 'object' &&
    details !== null &&
    'reason' in details &&
    typeof details.reason === 'string'
  ) {
    return details.reason
  }
  return fallback
}

async function emit(options: ExecuteReleasePlanOptions, event: ExecutionEvent): Promise<void> {
  try {
    await options.onEvent?.(event)
  } catch {
    noop()
  }
}

async function emitDryRunProgress(
  plan: ReleasePlan,
  options: ExecuteReleasePlanOptions,
): Promise<void> {
  async function emitStage(index: number): Promise<void> {
    const stage = STAGE_ORDER[index]
    if (stage === undefined) {
      return
    }
    await emit(options, {
      kind: 'stage-skipped',
      stage,
      reason: isPlanStage(plan, stage) ? 'dry run; no write' : disabledStageReason(plan, stage),
      verification: isPlanStage(plan, stage) ? 'dry-run' : 'disabled',
    })
    await emitStage(index + 1)
  }
  await emitStage(0)
  await emit(options, { kind: 'dry-run-completed' })
}

async function assertInitialFingerprint(
  deps: ExecutionDependencies,
  plan: ReleasePlan,
): Promise<void> {
  const actual = await deps.readFingerprint(plan)
  const mismatch = compareFingerprints(plan.fingerprint, actual)[0]
  if (mismatch !== undefined) {
    throw new StalePlan(mismatch.field, mismatch.expected, mismatch.actual)
  }
}

async function appendFailure(
  journal: JournalSession,
  stage: StageName,
  error: unknown,
  options: ExecuteReleasePlanOptions,
  eventReason?: string,
): Promise<void> {
  await journal.append({
    stage,
    outcome: 'failed',
    details: { message: error instanceof Error ? error.message : String(error) },
  })
  await emit(options, {
    kind: 'stage-failed',
    stage,
    ...(eventReason === undefined ? {} : { reason: eventReason }),
  })
}

async function runOrdinaryStage(
  stage: StageName,
  port: ExecutionStage,
  plan: ReleasePlan,
  state: RunState,
  options: ExecuteReleasePlanOptions,
): Promise<void> {
  let check: StageCheck
  try {
    check = await port.check(plan, state.context)
  } catch (error) {
    await appendFailure(state.journal, stage, error, options)
    if (state.npmPublished) {
      throw new PartialRelease(
        completedStages(state.results),
        stage,
        remainingStages(plan, stage),
        `releaser resume --cwd ${JSON.stringify(plan.repositoryRoot)}`,
        error instanceof Error ? error.message : String(error),
      )
    }
    throw error
  }
  updateContext(state.context, check)
  if (check.kind === 'complete') {
    await state.journal.append({ stage, outcome: 'skipped', details: check.details })
    state.results.push({ stage, outcome: 'skipped', details: check.details })
    await emit(options, {
      kind: 'stage-skipped',
      stage,
      reason: detailReason(check.details, 'already complete; verified'),
      verification: 'already-complete',
    })
    await options.afterStage?.(stage)
    return
  }

  await state.journal.append({ stage, outcome: 'running' })
  await emit(options, { kind: 'stage-started', stage })
  let written: StageWrite
  try {
    written = await port.write(plan, state.context)
    updateContext(state.context, written)
    await state.journal.append({ stage, outcome: 'succeeded', details: written.details })
    await emit(options, { kind: 'stage-succeeded', stage })
  } catch (error) {
    await appendFailure(state.journal, stage, error, options)
    if (state.npmPublished) {
      throw new PartialRelease(
        completedStages(state.results),
        stage,
        remainingStages(plan, stage),
        `releaser resume --cwd ${JSON.stringify(plan.repositoryRoot)}`,
        error instanceof Error ? error.message : String(error),
      )
    }
    throw error
  }
  state.results.push({ stage, outcome: 'succeeded', details: written.details })
  await options.afterStage?.(stage)
}

async function resolvePublishFailure(
  plan: ReleasePlan,
  state: PublishRunState,
  error: unknown,
  options: ExecuteReleasePlanOptions,
): Promise<'landed' | 'absent'> {
  await state.journal.append({
    stage: 'npm-publish',
    outcome: 'unknown',
    details: { message: error instanceof Error ? error.message : String(error) },
  })
  await emit(options, { kind: 'publish-outcome-unknown', stage: 'npm-publish' })
  let checked: StageCheck
  try {
    checked = await statePublishCheck(plan, state)
  } catch (verificationError) {
    await appendFailure(state.journal, 'npm-publish', verificationError, options)
    throw verificationError
  }
  if (checked.kind === 'complete') {
    updateContext(state.context, checked)
    await state.journal.append({
      stage: 'npm-publish',
      outcome: 'succeeded',
      details: checked.details,
    })
    state.results.push({ stage: 'npm-publish', outcome: 'succeeded', details: checked.details })
    state.npmPublished = true
    await emit(options, {
      kind: 'stage-succeeded',
      stage: 'npm-publish',
      reason: 'registry confirms publication',
    })
    await options.afterStage?.('npm-publish')
    return 'landed'
  }
  return 'absent'
}

function statePublishCheck(plan: ReleasePlan, state: PublishRunState): Promise<StageCheck> {
  return state.publishPort.check(plan, state.context)
}

type PublishRunState = RunState & { publishPort: ExecutionDependencies['publish'] }

async function runPublishStage(
  plan: ReleasePlan,
  state: PublishRunState,
  options: ExecuteReleasePlanOptions,
): Promise<void> {
  let check: StageCheck
  try {
    check = await state.publishPort.check(plan, state.context)
  } catch (error) {
    await appendFailure(state.journal, 'npm-publish', error, options)
    throw error
  }
  if (check.kind === 'complete') {
    await state.journal.append({ stage: 'npm-publish', outcome: 'skipped', details: check.details })
    state.results.push({ stage: 'npm-publish', outcome: 'skipped', details: check.details })
    state.npmPublished = true
    await emit(options, {
      kind: 'stage-skipped',
      stage: 'npm-publish',
      reason: detailReason(check.details, 'already published; verified'),
      verification: 'already-complete',
    })
    await options.afterStage?.('npm-publish')
    return
  }

  await state.journal.append({ stage: 'npm-publish', outcome: 'running' })
  await emit(options, { kind: 'stage-started', stage: 'npm-publish' })
  async function attempt(otp: string | undefined, otpRetried: boolean): Promise<void> {
    let written: StageWrite
    try {
      written =
        otp === undefined
          ? await state.publishPort.write(plan, state.context)
          : await state.publishPort.writeWithOtp(plan, state.context, otp)
      await state.journal.append({
        stage: 'npm-publish',
        outcome: 'succeeded',
        details: written.details,
      })
      await emit(options, { kind: 'stage-succeeded', stage: 'npm-publish' })
    } catch (error) {
      if ((await resolvePublishFailure(plan, state, error, options)) === 'landed') {
        return
      }

      if (
        error instanceof OtpRequired &&
        options.interactive === true &&
        !otpRetried &&
        options.requestOtp !== undefined
      ) {
        const requested = await options.requestOtp()
        if (requested !== null) {
          otp = requested
          await state.journal.append({ stage: 'npm-publish', outcome: 'running' })
          await emit(options, { kind: 'stage-started', stage: 'npm-publish' })
          return attempt(otp, true)
        }
      }

      await appendFailure(
        state.journal,
        'npm-publish',
        error,
        options,
        'registry confirms version is absent; release stopped',
      )
      if (error instanceof OtpRequired && options.interactive !== true) {
        throw new OtpRequired(false)
      }
      if (error instanceof LifecycleScriptFailed) {
        throw error
      }
      throw error
    }
    state.results.push({ stage: 'npm-publish', outcome: 'succeeded', details: written.details })
    state.npmPublished = true
    await options.afterStage?.('npm-publish')
  }

  return attempt(options.otp, false)
}

async function executeStages(
  deps: ExecutionDependencies,
  plan: ReleasePlan,
  journal: JournalSession,
  options: ExecuteReleasePlanOptions,
): Promise<ExecuteReleasePlanResult> {
  const state: PublishRunState = {
    journal,
    context: { releaseCommitSha: null },
    results: [],
    npmPublished: false,
    publishPort: deps.publish,
  }

  async function runStage(index: number): Promise<void> {
    const stage = STAGE_ORDER[index]
    if (stage === undefined) {
      return
    }
    if (!isPlanStage(plan, stage)) {
      const reason = disabledStageReason(plan, stage)
      await journal.append({ stage, outcome: 'skipped', details: { reason } })
      state.results.push({ stage, outcome: 'skipped', details: { reason } })
      await emit(options, {
        kind: 'stage-skipped',
        stage,
        reason,
        verification: 'disabled',
      })
    } else if (stage === 'npm-publish') {
      await runPublishStage(plan, state, options)
    } else {
      await runOrdinaryStage(stage, deps.stages[stage], plan, state, options)
    }
    return runStage(index + 1)
  }

  await runStage(0)
  await journal.complete()
  await emit(options, { kind: 'release-completed' })
  return { kind: 'completed', stages: state.results, journalPath: journal.paths.journal }
}

export async function executeReleasePlan(
  deps: ExecutionDependencies,
  plan: ReleasePlan,
  options: ExecuteReleasePlanOptions = {},
): Promise<ExecuteReleasePlanResult> {
  if (options.dryRun === true) {
    await assertInitialFingerprint(deps, plan)
    const fileDiff = await deps.dryRun.previewFileMutations(plan)
    const packageInspection =
      plan.npmPublish.kind === 'publish'
        ? await deps.dryRun.inspectPackage(plan)
        : { skipped: true, reason: plan.npmPublish.reason }
    const publishInspection =
      plan.npmPublish.kind === 'publish'
        ? await deps.dryRun.publishDryRun(plan)
        : { skipped: true, reason: plan.npmPublish.reason }
    await emitDryRunProgress(plan, options)
    return { kind: 'dry-run', fileDiff, packageInspection, publishInspection }
  }

  const journal = await deps.journal.open(plan.repositoryRoot)
  try {
    const existing = await journal.read()
    if (existing !== null && existing.completedAt === null) {
      return resumeWithSession(deps, existing, journal, options)
    }
    await assertInitialFingerprint(deps, plan)
    await journal.initialize(plan)
    return await executeStages(deps, plan, journal, options)
  } finally {
    await journal.release()
  }
}

export async function resumeWithSession(
  deps: ExecutionDependencies,
  stored: ReleaseJournal,
  journal: JournalSession,
  options: ExecuteReleasePlanOptions = {},
): Promise<ExecuteReleasePlanResult> {
  if (stored.entries.length === 0) {
    await assertInitialFingerprint(deps, stored.plan)
  }
  return executeStages(deps, stored.plan, journal, options)
}

export { latestOutcome }
