import type { ReleaseCheck } from '../domain/checks.js'
import type { ReleaserError } from '../domain/errors.js'
import { defaultRedactor } from '../shared/redaction.js'
import { renderError, type ErrorView, type KeyValueRow } from '../ui/index.js'

type ErrorDetails = Record<string, unknown>

function detailsRecord(value: unknown): ErrorDetails {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as ErrorDetails)
    : {}
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value === undefined) {
    return 'none'
  }
  return JSON.stringify(value)
}

function genericDetailRows(details: unknown): KeyValueRow[] {
  return Object.entries(detailsRecord(details)).map(([label, value]) => ({
    label,
    value: displayValue(value),
  }))
}

function preflightRows(details: unknown): KeyValueRow[] {
  const checks = detailsRecord(details).checks
  if (!Array.isArray(checks)) {
    return []
  }
  return (checks as ReleaseCheck[]).flatMap((check) =>
    check.outcome === 'blocked'
      ? [
          {
            label: check.title,
            value: `${check.message} Fix: ${check.remediation}`,
            state: 'failure' as const,
          },
        ]
      : [],
  )
}

function partialReleaseRows(details: unknown): KeyValueRow[] {
  const values = detailsRecord(details)
  return [
    { label: 'Completed', value: displayValue(values.completedStages) },
    { label: 'Failed', value: displayValue(values.failedStage) },
    { label: 'Remaining', value: displayValue(values.remainingStages) },
    ...(values.failure === undefined
      ? []
      : [{ label: 'Failure', value: displayValue(values.failure) }]),
  ]
}

function errorTitle(error: ReleaserError): string {
  if (error.kind === 'Cancelled' || error.kind === 'CancelledAfterPreparation') {
    return 'Cancelled'
  }
  if (error.kind === 'PreflightFailed') {
    return 'Preflight blocked'
  }
  if (error.kind === 'PartialRelease') {
    return 'Partial release'
  }
  return error.kind.replaceAll(/([a-z])([A-Z])/gu, '$1 $2')
}

export function releaserErrorView(error: ReleaserError): ErrorView {
  const safe = defaultRedactor.redactValue(error)
  const details =
    error.kind === 'PreflightFailed'
      ? preflightRows(safe.details)
      : error.kind === 'PartialRelease'
        ? partialReleaseRows(safe.details)
        : genericDetailRows(safe.details)
  const recoveryCommand =
    error.kind === 'PartialRelease' ? detailsRecord(safe.details).resumeCommand : undefined
  return {
    title: errorTitle(safe),
    message: safe.message,
    ...(details.length === 0 ? {} : { details }),
    remediation: safe.remediation,
    ...(typeof recoveryCommand === 'string' ? { recoveryCommand } : {}),
  }
}

export function renderReleaserError(error: ReleaserError, colorEnabled: boolean): string {
  return renderError(releaserErrorView(error), { colorEnabled })
}

export function renderUnknownError(error: unknown, verbose: boolean): string {
  const message = error instanceof Error ? error.message : String(error)
  if (!verbose || !(error instanceof Error) || error.stack === undefined) {
    return defaultRedactor.redactText(message)
  }
  return defaultRedactor.redactText(error.stack)
}
