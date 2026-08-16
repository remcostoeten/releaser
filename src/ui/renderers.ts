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

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`
}
