import type {
  ExecutedStage,
  ExecuteReleasePlanResult,
  ExecutionEvent,
} from '../application/execute-release-plan.js'
import { planStages, type ReleasePlan } from '../domain/release-plan.js'
import { STAGE_ORDER, type StageName } from '../domain/stages.js'
import type {
  DryRunSummaryView,
  FileDiffView,
  KeyValueRow,
  OutputEnvironment,
  ProgressEventView,
  SuccessSummaryView,
} from '../ui/index.js'
import { renderDryRunSummary, renderProgressEvent, renderSuccessSummary } from '../ui/index.js'

const STAGE_LABELS: Record<StageName, string> = {
  'mutate-files': 'Mutate files',
  commit: 'Create release commit',
  tag: 'Create annotated tag',
  'push-branch': 'Push branch',
  'push-tag': 'Push tag',
  'npm-publish': 'Publish to npm',
  'github-release': 'Create GitHub Release',
}

export type ProgressReporter = {
  onEvent(event: ExecutionEvent): void
  events: readonly ExecutionEvent[]
}

export function executionProgressView(event: ExecutionEvent): ProgressEventView {
  if (event.kind === 'release-completed' || event.kind === 'dry-run-completed') {
    return {
      position: null,
      label: event.kind === 'release-completed' ? 'Release' : 'Dry run',
      status: 'completed',
    }
  }
  const position = STAGE_ORDER.indexOf(event.stage) + 1
  if (event.kind === 'stage-started') {
    return { position, label: STAGE_LABELS[event.stage], status: 'active' }
  }
  if (event.kind === 'stage-succeeded') {
    return {
      position,
      label: STAGE_LABELS[event.stage],
      status: 'completed',
      ...(event.reason === undefined ? {} : { detail: event.reason }),
    }
  }
  if (event.kind === 'stage-failed') {
    return {
      position,
      label: STAGE_LABELS[event.stage],
      status: 'failed',
      ...(event.reason === undefined ? {} : { detail: event.reason }),
    }
  }
  if (event.kind === 'publish-outcome-unknown') {
    return {
      position,
      label: STAGE_LABELS[event.stage],
      status: 'unknown',
      detail: 'command outcome unknown; verifying npm registry',
    }
  }
  return {
    position,
    label: STAGE_LABELS[event.stage],
    status: event.verification === 'already-complete' ? 'verified' : 'skipped',
    detail: event.reason,
  }
}

export function createProgressReporter(
  json: boolean,
  environment: OutputEnvironment,
  write: (line: string) => void = (line) => console.error(line),
): ProgressReporter {
  const events: ExecutionEvent[] = []
  return {
    events,
    onEvent(event) {
      events.push(event)
      if (!json) {
        write(renderProgressEvent(executionProgressView(event), environment))
      }
    },
  }
}

function stageReason(stage: ExecutedStage): string {
  if (
    typeof stage.details === 'object' &&
    stage.details !== null &&
    'reason' in stage.details &&
    typeof stage.details.reason === 'string'
  ) {
    return stage.details.reason
  }
  return 'already complete; verified'
}

function githubReleaseUrl(stages: readonly ExecutedStage[]): string | null {
  const details = stages.find((stage) => stage.stage === 'github-release')?.details
  if (
    typeof details === 'object' &&
    details !== null &&
    'url' in details &&
    typeof details.url === 'string'
  ) {
    return details.url
  }
  return null
}

export function releaseSummaryView(
  plan: ReleasePlan,
  result: Extract<ExecuteReleasePlanResult, { kind: 'completed' }>,
  resumed = false,
): SuccessSummaryView {
  const branch =
    plan.pushBranch.target.kind === 'branch'
      ? plan.pushBranch.target.branch
      : plan.pushBranch.target.tag
  const rows: KeyValueRow[] = [
    { label: 'Package', value: `${plan.packageName}@${plan.version.nextVersion}` },
    { label: 'Tag', value: plan.tag.name },
    { label: 'Branch', value: branch },
  ]
  if (plan.npmPublish.kind === 'publish') {
    rows.push({
      label: 'npm',
      value: `${plan.npmPublish.packageName}@${plan.npmPublish.version} (${plan.npmPublish.distTag})`,
    })
  }
  const releaseUrl = githubReleaseUrl(result.stages)
  if (releaseUrl !== null) {
    rows.push({ label: 'GitHub Release', value: releaseUrl })
  }
  if (resumed) {
    const planned = planStages(plan)
    const verified = result.stages.filter(
      (stage) => stage.outcome === 'skipped' && planned.includes(stage.stage),
    ).length
    const completed = result.stages.filter((stage) => stage.outcome === 'succeeded').length
    rows.push({ label: 'Resume', value: `${verified} verified, ${completed} newly completed` })
  }
  return {
    title: `${resumed ? 'Resumed release' : 'Released'} ${plan.packageName}@${plan.version.nextVersion}`,
    rows,
    skipped: result.stages
      .filter((stage) => stage.outcome === 'skipped')
      .map((stage) => `${STAGE_LABELS[stage.stage]} — ${stageReason(stage)}`),
    journalPath: result.journalPath,
  }
}

function stringProperty(value: unknown, property: string): string | null {
  if (
    typeof value === 'object' &&
    value !== null &&
    property in value &&
    typeof value[property as keyof typeof value] === 'string'
  ) {
    return value[property as keyof typeof value] as string
  }
  return null
}

function dryRunFiles(value: unknown): FileDiffView[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    const path = stringProperty(entry, 'path')
    const unified = stringProperty(entry, 'unified')
    return path !== null && unified !== null ? [{ path, diff: unified }] : []
  })
}

export function dryRunSummaryView(
  result: Extract<ExecuteReleasePlanResult, { kind: 'dry-run' }>,
): DryRunSummaryView {
  const name = stringProperty(result.packageInspection, 'name')
  const version = stringProperty(result.packageInspection, 'version')
  const reason = stringProperty(result.packageInspection, 'reason')
  const packageRows: KeyValueRow[] = []
  if (name !== null) {
    packageRows.push({ label: 'Package', value: version === null ? name : `${name}@${version}` })
  } else if (reason !== null) {
    packageRows.push({ label: 'Package', value: `skipped — ${reason}`, state: 'warning' })
  }
  const publishReason = stringProperty(result.publishInspection, 'reason')
  return {
    packageRows,
    files: dryRunFiles(result.fileDiff),
    publishDetail:
      publishReason === null ? 'dry-run inspection completed' : `skipped — ${publishReason}`,
  }
}

export function renderExecutionResult(
  plan: ReleasePlan,
  result: ExecuteReleasePlanResult,
  environment: OutputEnvironment,
  resumed = false,
): string {
  return result.kind === 'dry-run'
    ? renderDryRunSummary(dryRunSummaryView(result), environment)
    : renderSuccessSummary(releaseSummaryView(plan, result, resumed), environment)
}
