export type OutputEnvironment = {
  colorEnabled: boolean
}

export type SemanticState = 'success' | 'warning' | 'failure' | 'active' | 'muted'

export type KeyValueRow = {
  label: string
  value: string
  state?: SemanticState
}

export type CheckStatus = 'passed' | 'warned' | 'blocked' | 'skipped' | 'overridden'

export type CheckRowView = {
  status: CheckStatus
  title: string
  message?: string
  remediation?: string
}

export type CheckSummaryView = {
  passed: number
  warned: number
  blocked: number
  skipped: number
  overridden: number
}

export type ActionStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'failed' | 'verified'

export type ActionRowView = {
  position: number
  label: string
  status: ActionStatus
  detail?: string
}

export type FileDiffView = {
  path: string
  diff: string
}

export type OccurrenceView = {
  path: string
  line: number
  column: number
  preview?: string
}

export type ErrorView = {
  title: string
  message: string
  details?: readonly KeyValueRow[]
  remediation: string
  recoveryCommand?: string
}

export type SuccessSummaryView = {
  title: string
  rows: readonly KeyValueRow[]
  skipped?: readonly string[]
  journalPath?: string
}

export type NoteSectionView = {
  title: string
  changes: number
}

export type PlanReportView = {
  summary: readonly KeyValueRow[] | null
  checks: readonly CheckRowView[]
  checkSummary: CheckSummaryView
  files: readonly FileDiffView[]
  actions: readonly ActionRowView[]
  noteSections: readonly NoteSectionView[]
  noteChanges: number
}

export type DoctorReportView = {
  checks: readonly CheckRowView[]
  summary: CheckSummaryView
}

export type StatusSectionView = {
  title: string
  rows: readonly KeyValueRow[]
}

export type StatusReportView = {
  sections: readonly StatusSectionView[]
}

export type ScanReportView = {
  version: string
  occurrences: readonly OccurrenceView[]
}

export type ProgressStatus = 'active' | 'completed' | 'skipped' | 'verified' | 'unknown' | 'failed'

export type ProgressEventView = {
  position: number | null
  label: string
  status: ProgressStatus
  detail?: string
}

export type DryRunSummaryView = {
  packageRows: readonly KeyValueRow[]
  files: readonly FileDiffView[]
  publishDetail: string
}
