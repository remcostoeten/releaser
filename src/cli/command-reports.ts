import type { CreateReleasePlanResult } from '../application/create-release-plan.js'
import type { ReleaseCheck } from '../domain/checks.js'
import type { ChangeCategory } from '../domain/changes.js'
import type { FileMutation, TextEdit } from '../domain/mutations.js'
import type { ReleasePlan } from '../domain/release-plan.js'
import type {
  ActionRowView,
  CheckRowView,
  CheckSummaryView,
  DoctorReportView,
  FileDiffView,
  KeyValueRow,
  OccurrenceView,
  PlanReportView,
  ScanReportView,
} from '../ui/index.js'

export { statusReportView } from './status-report.js'

const CATEGORY_TITLES: Record<ChangeCategory, string> = {
  breaking: 'Breaking changes',
  features: 'Features',
  fixes: 'Fixes',
  performance: 'Performance',
  documentation: 'Documentation',
  dependencies: 'Dependencies',
  maintenance: 'Maintenance',
  other: 'Other',
}

export function planReportView(result: CreateReleasePlanResult): PlanReportView {
  const checks = orderedChecks(result.checks).map((check) => checkRowView(check))
  const common = {
    checks,
    checkSummary: checkSummaryView(result.checks),
  }
  if (result.kind === 'not-planned') {
    return {
      ...common,
      summary: null,
      files: [],
      actions: [],
      noteSections: [],
      noteChanges: 0,
    }
  }

  return {
    ...common,
    summary: planSummary(result.plan),
    files: mutationDiffs(result.plan.fileMutations),
    actions: planActions(result.plan),
    noteSections: result.plan.notes.sections.map((section) => ({
      title: CATEGORY_TITLES[section.category],
      changes: section.changes.length,
    })),
    noteChanges: result.plan.notes.sections.reduce(
      (total, section) => total + section.changes.length,
      0,
    ),
  }
}

export function doctorReportView(checks: readonly ReleaseCheck[]): DoctorReportView {
  return {
    checks: orderedChecks(checks).map((check) => checkRowView(check)),
    summary: checkSummaryView(checks),
  }
}

export function scanReportView(result: {
  version: string
  occurrences: readonly { file: string; line: number; column: number }[]
}): ScanReportView {
  return {
    version: result.version,
    occurrences: result.occurrences.map((occurrence): OccurrenceView => ({
      path: occurrence.file,
      line: occurrence.line,
      column: occurrence.column,
    })),
  }
}

function orderedChecks(checks: readonly ReleaseCheck[]): ReleaseCheck[] {
  const rank: Record<ReleaseCheck['outcome'], number> = {
    blocked: 0,
    warned: 1,
    skipped: 2,
    informed: 3,
    passed: 4,
  }
  return checks.toSorted((left, right) => rank[left.outcome] - rank[right.outcome])
}

function checkRowView(check: ReleaseCheck): CheckRowView {
  if (check.outcome === 'passed') {
    return { status: 'passed', title: check.title }
  }
  if (check.outcome === 'skipped') {
    return { status: 'skipped', title: check.title, message: check.reason }
  }
  if (check.outcome === 'informed') {
    return { status: 'passed', title: check.title, message: check.message }
  }
  if (check.outcome === 'warned') {
    return {
      status: 'warned',
      title: check.title,
      message: check.message,
      remediation: check.remediation,
    }
  }
  return {
    status: 'blocked',
    title: check.title,
    message: check.message,
    remediation: check.remediation,
  }
}

function checkSummaryView(checks: readonly ReleaseCheck[]): CheckSummaryView {
  return {
    passed: checks.filter((check) => check.outcome === 'passed' || check.outcome === 'informed')
      .length,
    warned: checks.filter((check) => check.outcome === 'warned').length,
    blocked: checks.filter((check) => check.outcome === 'blocked').length,
    skipped: checks.filter((check) => check.outcome === 'skipped').length,
    overridden: 0,
  }
}

function planSummary(plan: ReleasePlan): KeyValueRow[] {
  const branch =
    plan.pushBranch.target.kind === 'branch'
      ? plan.pushBranch.target.branch
      : plan.pushBranch.target.tag
  return [
    { label: 'Package', value: plan.packageName },
    {
      label: 'Version',
      value: `${plan.version.previousVersion} -> ${plan.version.nextVersion}`,
      state: 'active',
    },
    { label: 'Branch', value: branch },
    { label: 'Remote', value: plan.pushBranch.remote },
    { label: 'Tag', value: plan.tag.name },
    {
      label: 'npm dist-tag',
      value: plan.npmPublish.kind === 'publish' ? plan.npmPublish.distTag : 'skipped',
      state: plan.npmPublish.kind === 'publish' ? 'active' : 'warning',
    },
  ]
}

function mutationDiffs(mutations: readonly FileMutation[]): FileDiffView[] {
  const editsByPath = new Map<string, TextEdit[]>()
  for (const mutation of mutations) {
    const edits = editsByPath.get(mutation.path) ?? []
    edits.push(...mutation.edits)
    editsByPath.set(mutation.path, edits)
  }
  return [...editsByPath.entries()].map(([path, edits]) => ({
    path,
    diff: [`--- a/${path}`, `+++ b/${path}`, ...edits.flatMap((edit) => diffLines(edit))].join(
      '\n',
    ),
  }))
}

function diffLines(edit: TextEdit): string[] {
  return [
    ...edit.deletedText.split('\n').map((line) => `-${line}`),
    ...edit.insertedText.split('\n').map((line) => `+${line}`),
  ]
}

function planActions(plan: ReleasePlan): ActionRowView[] {
  return [
    {
      position: 1,
      label: 'Mutate files',
      status: 'pending',
      detail: `${plan.fileMutations.length} planned mutation${plan.fileMutations.length === 1 ? '' : 's'}`,
    },
    { position: 2, label: 'Create release commit', status: 'pending', detail: plan.commit.message },
    { position: 3, label: 'Create annotated tag', status: 'pending', detail: plan.tag.name },
    {
      position: 4,
      label: 'Push branch',
      status: 'pending',
      detail: plan.pushBranch.remote,
    },
    { position: 5, label: 'Push tag', status: 'pending', detail: plan.pushTag.remote },
    plan.npmPublish.kind === 'publish'
      ? {
          position: 6,
          label: 'Publish to npm',
          status: 'pending',
          detail: `${plan.npmPublish.packageName}@${plan.npmPublish.version} (${plan.npmPublish.distTag})`,
        }
      : {
          position: 6,
          label: 'Publish to npm',
          status: 'skipped',
          detail: plan.npmPublish.reason,
        },
    plan.githubRelease.kind === 'create'
      ? {
          position: 7,
          label: 'Create GitHub Release',
          status: 'pending',
          detail: `${plan.githubRelease.owner}/${plan.githubRelease.repo}`,
        }
      : {
          position: 7,
          label: 'Create GitHub Release',
          status: 'skipped',
          detail: plan.githubRelease.reason,
        },
  ]
}
