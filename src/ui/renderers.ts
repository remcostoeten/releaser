import type {
  ActionRowView,
  CheckRowView,
  CheckStatus,
  CheckSummaryView,
  ErrorView,
  FileDiffView,
  KeyValueRow,
  OccurrenceView,
  OutputEnvironment,
  PlanReportView,
  DoctorReportView,
  DryRunSummaryView,
  ProgressEventView,
  StatusReportView,
  ScanReportView,
  SemanticState,
  SuccessSummaryView,
} from './models.js'
import { sanitizeTerminalText, styleText } from './style.js'

const CHECK_MARKERS: Record<CheckStatus, string> = {
  passed: 'PASS',
  warned: 'WARN',
  blocked: 'BLOCK',
  skipped: 'SKIP',
  overridden: 'OVERRIDE',
}

const CHECK_STATES: Record<CheckStatus, SemanticState> = {
  passed: 'success',
  warned: 'warning',
  blocked: 'failure',
  skipped: 'warning',
  overridden: 'warning',
}

const ACTION_STATES: Record<ActionRowView['status'], SemanticState> = {
  pending: 'muted',
  active: 'active',
  completed: 'success',
  skipped: 'warning',
  failed: 'failure',
  verified: 'success',
}

const PROGRESS_STATES: Record<ProgressEventView['status'], SemanticState> = {
  active: 'active',
  completed: 'success',
  skipped: 'warning',
  verified: 'success',
  unknown: 'warning',
  failed: 'failure',
}

export function renderHeading(title: string, environment: OutputEnvironment): string {
  return styleText(sanitizeTerminalText(title), 'active', environment)
}

export function renderKeyValueRows(
  rows: readonly KeyValueRow[],
  environment: OutputEnvironment,
): string {
  if (rows.length === 0) {
    return ''
  }

  const labels = rows.map((row) => sanitizeTerminalText(row.label))
  const width = Math.max(...labels.map((label) => label.length))
  return rows
    .map((row, index) => {
      const label = labels[index] ?? ''
      const value = sanitizeTerminalText(row.value)
      const renderedValue = row.state ? styleText(value, row.state, environment) : value
      return `${label.padEnd(width)}  ${renderedValue}`
    })
    .join('\n')
}

export function renderCheckRow(check: CheckRowView, environment: OutputEnvironment): string {
  const marker = styleText(CHECK_MARKERS[check.status], CHECK_STATES[check.status], environment)
  const lines = [`${marker}  ${sanitizeTerminalText(check.title)}`]
  if (check.message) {
    lines.push(`       ${sanitizeTerminalText(check.message)}`)
  }
  if (check.remediation) {
    lines.push(`       Fix: ${sanitizeTerminalText(check.remediation)}`)
  }
  return lines.join('\n')
}

export function renderCheckRows(
  checks: readonly CheckRowView[],
  environment: OutputEnvironment,
): string {
  return checks.length === 0
    ? 'No checks.'
    : checks.map((check) => renderCheckRow(check, environment)).join('\n')
}

export function renderCheckSummary(
  summary: CheckSummaryView,
  environment: OutputEnvironment,
): string {
  const parts = [
    pluralize(summary.passed, 'passed check'),
    pluralize(summary.warned, 'warning'),
    pluralize(summary.blocked, 'blocker'),
    pluralize(summary.skipped, 'skipped check'),
    pluralize(summary.overridden, 'override'),
  ]
  const state =
    summary.blocked > 0
      ? 'failure'
      : summary.warned + summary.overridden > 0
        ? 'warning'
        : 'success'
  return styleText(parts.join(', '), state, environment)
}

export function renderActionRows(
  actions: readonly ActionRowView[],
  environment: OutputEnvironment,
): string {
  if (actions.length === 0) {
    return 'No actions.'
  }

  return actions
    .map((action) => {
      const status = styleText(action.status, ACTION_STATES[action.status], environment)
      const detail = action.detail ? ` — ${sanitizeTerminalText(action.detail)}` : ''
      return `${action.position}. ${sanitizeTerminalText(action.label)} [${status}]${detail}`
    })
    .join('\n')
}

export function renderFileDiffs(
  files: readonly FileDiffView[],
  environment: OutputEnvironment,
): string {
  if (files.length === 0) {
    return 'No file changes.'
  }

  return files
    .map((file) => {
      const path = styleText(sanitizeTerminalText(file.path), 'active', environment)
      const diff = sanitizeTerminalText(file.diff)
      return `${path}\n${diff}`
    })
    .join('\n\n')
}

export function renderOccurrences(
  occurrences: readonly OccurrenceView[],
  environment: OutputEnvironment,
): string {
  if (occurrences.length === 0) {
    return 'No tracked occurrences found.'
  }

  return occurrences
    .map((occurrence) => {
      const location = `${sanitizeTerminalText(occurrence.path)}:${occurrence.line}:${occurrence.column}`
      const renderedLocation = styleText(location, 'active', environment)
      const preview = occurrence.preview ? `  ${sanitizeTerminalText(occurrence.preview)}` : ''
      return `${renderedLocation}${preview}`
    })
    .join('\n')
}

export function renderError(view: ErrorView, environment: OutputEnvironment): string {
  const lines = [styleText(view.title, 'failure', environment), sanitizeTerminalText(view.message)]
  if (view.details && view.details.length > 0) {
    lines.push('', renderKeyValueRows(view.details, environment))
  }
  lines.push('', `Fix: ${sanitizeTerminalText(view.remediation)}`)
  if (view.recoveryCommand) {
    lines.push(`Recover: ${sanitizeTerminalText(view.recoveryCommand)}`)
  }
  return lines.join('\n')
}

export function renderSuccessSummary(
  view: SuccessSummaryView,
  environment: OutputEnvironment,
): string {
  const lines = [styleText(view.title, 'success', environment)]
  if (view.rows.length > 0) {
    lines.push('', renderKeyValueRows(view.rows, environment))
  }
  if (view.skipped && view.skipped.length > 0) {
    lines.push('', ...view.skipped.map((item) => `Skipped: ${sanitizeTerminalText(item)}`))
  }
  if (view.journalPath) {
    lines.push('', styleText(sanitizeTerminalText(view.journalPath), 'muted', environment))
  }
  return lines.join('\n')
}

export function renderProgressEvent(
  view: ProgressEventView,
  environment: OutputEnvironment,
): string {
  const position = view.position === null ? '' : `${view.position}. `
  const status = styleText(view.status, PROGRESS_STATES[view.status], environment)
  const detail = view.detail ? ` — ${sanitizeTerminalText(view.detail)}` : ''
  return `${position}${sanitizeTerminalText(view.label)} [${status}]${detail}`
}

export function renderDryRunSummary(
  view: DryRunSummaryView,
  environment: OutputEnvironment,
): string {
  const packageDetails = renderKeyValueRows(view.packageRows, environment)
  return [
    styleText('Dry run complete — nothing was written', 'success', environment),
    packageDetails,
    `npm publish: ${sanitizeTerminalText(view.publishDetail)}`,
    '',
    renderHeading('File changes', environment),
    renderFileDiffs(view.files, environment),
  ]
    .filter((section, index) => section.length > 0 || index === 3)
    .join('\n')
}

export function renderPlanReport(view: PlanReportView, environment: OutputEnvironment): string {
  const sections = [renderHeading('Release plan', environment)]

  if (view.summary !== null) {
    sections.push(renderKeyValueRows(view.summary, environment))
  }

  sections.push(
    [
      renderHeading('Preflight', environment),
      renderCheckRows(view.checks, environment),
      renderCheckSummary(view.checkSummary, environment),
    ].join('\n'),
  )

  if (view.summary === null) {
    sections.push('No release plan could be built.')
  } else {
    sections.push(
      [renderHeading('Changed files', environment), renderFileDiffs(view.files, environment)].join(
        '\n',
      ),
      [
        renderHeading('Release actions', environment),
        renderActionRows(view.actions, environment),
      ].join('\n'),
      [renderHeading('Release notes', environment), renderNoteSummary(view)].join('\n'),
    )
  }

  sections.push('Planning made no changes.')
  return sections.join('\n\n')
}

export function renderDoctorReport(view: DoctorReportView, environment: OutputEnvironment): string {
  return [
    renderHeading('Preflight doctor', environment),
    renderCheckRows(view.checks, environment),
    renderCheckSummary(view.summary, environment),
  ].join('\n')
}

export function renderStatusReport(view: StatusReportView, environment: OutputEnvironment): string {
  return view.sections
    .map((section) =>
      [
        renderHeading(section.title, environment),
        renderKeyValueRows(section.rows, environment),
      ].join('\n'),
    )
    .join('\n\n')
}

export function renderScanReport(view: ScanReportView, environment: OutputEnvironment): string {
  const count = view.occurrences.length
  return [
    renderHeading('Version occurrences', environment),
    renderKeyValueRows(
      [
        { label: 'Current version', value: view.version },
        { label: 'Occurrences', value: String(count), state: count === 0 ? 'warning' : 'success' },
      ],
      environment,
    ),
    renderOccurrences(view.occurrences, environment),
  ].join('\n\n')
}

function renderNoteSummary(view: PlanReportView): string {
  if (view.noteSections.length === 0) {
    return 'No release-note changes.'
  }

  return [
    `${view.noteChanges} release-note ${view.noteChanges === 1 ? 'change' : 'changes'}`,
    ...view.noteSections.map(
      (section) =>
        `${section.title}: ${section.changes} ${section.changes === 1 ? 'change' : 'changes'}`,
    ),
  ].join('\n')
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}
