import type { ReleaseCheck, ReleaseCheckId } from '../domain/checks.js'
import { unoverridableBlockers } from '../domain/checks.js'
import { Cancelled, PreflightFailed } from '../domain/errors.js'

export type OverrideConfirmation = (message: string) => Promise<boolean>

export type PreflightAuthorizationOptions = {
  yes: boolean
  canPrompt: boolean
  confirmOverride?: OverrideConfirmation
}

function overridableBlockers(
  checks: readonly ReleaseCheck[],
): Extract<ReleaseCheck, { outcome: 'blocked' }>[] {
  return checks.filter(
    (check): check is Extract<ReleaseCheck, { outcome: 'blocked' }> =>
      check.outcome === 'blocked' && check.overridable,
  )
}

function consequence(check: Extract<ReleaseCheck, { outcome: 'blocked' }>): string {
  const consequences: Partial<Record<ReleaseCheckId, string>> = {
    'working-tree-clean': 'Uncommitted files may be included in or conflict with the release.',
    'no-detached-head': 'The release commit will not start from a named branch.',
    'upstream-configured': 'The branch has no configured upstream for comparison.',
    'github-token-valid': 'The GitHub Release stage will be skipped.',
  }
  return consequences[check.id] ?? 'This safety check will be explicitly overridden.'
}

export function renderOverridePrompt(check: Extract<ReleaseCheck, { outcome: 'blocked' }>): string {
  return [
    check.title,
    check.message,
    `Consequence: ${consequence(check)}`,
    `Remediation: ${check.remediation}`,
    'Override this check?',
  ].join('\n')
}

export async function authorizePreflight(
  checks: readonly ReleaseCheck[],
  options: PreflightAuthorizationOptions,
): Promise<ReleaseCheckId[]> {
  if (unoverridableBlockers(checks).length > 0) {
    throw new PreflightFailed(checks)
  }

  const blockers = overridableBlockers(checks)
  if (blockers.length === 0) {
    return []
  }
  if (options.yes) {
    return blockers.map((check) => check.id)
  }
  if (!options.canPrompt || options.confirmOverride === undefined) {
    throw new PreflightFailed(checks)
  }

  return confirmBlockers(blockers, options.confirmOverride)
}

async function confirmBlockers(
  blockers: readonly Extract<ReleaseCheck, { outcome: 'blocked' }>[],
  confirmOverride: OverrideConfirmation,
  offset = 0,
): Promise<ReleaseCheckId[]> {
  const blocker = blockers[offset]
  if (blocker === undefined) {
    return []
  }
  if (!(await confirmOverride(renderOverridePrompt(blocker)))) {
    throw new Cancelled()
  }
  return [blocker.id, ...(await confirmBlockers(blockers, confirmOverride, offset + 1))]
}
