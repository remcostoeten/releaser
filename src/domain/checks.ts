export type ReleaseCheckId =
  | 'inside-git-repository'
  | 'git-available'
  | 'npm-available'
  | 'working-tree-clean'
  | 'no-detached-head'
  | 'remote-configured'
  | 'upstream-configured'
  | 'not-behind-upstream'
  | 'not-diverged-from-upstream'
  | 'on-release-branch'
  | 'tag-available'
  | 'version-not-published'
  | 'manifest-valid'
  | 'package-not-private'
  | 'npm-authenticated'
  | 'github-token-valid'
  | 'github-token-can-write'
  | 'replacements-match'

export type ReleaseCheck =
  | { id: ReleaseCheckId; title: string; outcome: 'passed' }
  | { id: ReleaseCheckId; title: string; outcome: 'skipped'; reason: string }
  | { id: ReleaseCheckId; title: string; outcome: 'informed'; message: string }
  | { id: ReleaseCheckId; title: string; outcome: 'warned'; message: string; remediation: string }
  | {
      id: ReleaseCheckId
      title: string
      outcome: 'blocked'
      overridable: boolean
      message: string
      remediation: string
    }

export function checkPassed(id: ReleaseCheckId, title: string): ReleaseCheck {
  return { id, title, outcome: 'passed' }
}

export function checkSkipped(id: ReleaseCheckId, title: string, reason: string): ReleaseCheck {
  return { id, title, outcome: 'skipped', reason }
}

export function checkInformed(id: ReleaseCheckId, title: string, message: string): ReleaseCheck {
  return { id, title, outcome: 'informed', message }
}

export function checkWarned(
  id: ReleaseCheckId,
  title: string,
  message: string,
  remediation: string,
): ReleaseCheck {
  return { id, title, outcome: 'warned', message, remediation }
}

export function checkBlocked(
  id: ReleaseCheckId,
  title: string,
  message: string,
  remediation: string,
  overridable: boolean,
): ReleaseCheck {
  return { id, title, outcome: 'blocked', overridable, message, remediation }
}

export function blockingChecks(checks: readonly ReleaseCheck[]): ReleaseCheck[] {
  return checks.filter((check) => check.outcome === 'blocked')
}

export function isBlocked(checks: readonly ReleaseCheck[]): boolean {
  return blockingChecks(checks).length > 0
}

export function unoverridableBlockers(checks: readonly ReleaseCheck[]): ReleaseCheck[] {
  return checks.filter((check) => check.outcome === 'blocked' && !check.overridable)
}
