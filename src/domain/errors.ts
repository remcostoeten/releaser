export abstract class ReleaserError extends Error {
  abstract readonly kind: string
  abstract readonly remediation: string
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.details = details
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class NotAGitRepository extends ReleaserError {
  readonly kind = 'NotAGitRepository'
  readonly remediation = 'Run this command from within a Git repository.'

  constructor(path: string) {
    super(`Not a Git repository: ${path}`, { path })
  }
}

export class DirtyWorkingTree extends ReleaserError {
  readonly kind = 'DirtyWorkingTree'
  readonly remediation = 'Commit or stash your changes, or use --yes to override.'

  constructor(files: string[]) {
    super(`Working tree has uncommitted changes`, { files })
  }
}

export class DetachedHead extends ReleaserError {
  readonly kind = 'DetachedHead'
  readonly remediation = 'Check out a branch, or use --yes to override.'

  constructor() {
    super('HEAD is detached')
  }
}

export class BranchBehind extends ReleaserError {
  readonly kind = 'BranchBehind'
  readonly remediation = 'Pull the latest changes from the remote.'

  constructor(branch: string, behindBy: number) {
    super(`Branch ${branch} is behind upstream by ${behindBy} commit(s)`, { branch, behindBy })
  }
}

export class BranchDiverged extends ReleaserError {
  readonly kind = 'BranchDiverged'
  readonly remediation = 'Resolve the divergence before releasing.'

  constructor(branch: string) {
    super(`Branch ${branch} has diverged from upstream`, { branch })
  }
}

export class NoUpstream extends ReleaserError {
  readonly kind = 'NoUpstream'
  readonly remediation =
    'Set an upstream branch with `git branch --set-upstream-to`, or use --yes to override.'

  constructor(branch: string) {
    super(`Branch ${branch} has no upstream configured`, { branch })
  }
}

export class TagExists extends ReleaserError {
  readonly kind = 'TagExists'
  readonly remediation =
    'Delete the existing tag locally and remotely, or choose a different version.'

  constructor(tag: string, location: 'local' | 'remote' | 'both') {
    super(`Tag ${tag} already exists ${location}`, { tag, location })
  }
}

export class InvalidVersion extends ReleaserError {
  readonly kind = 'InvalidVersion'
  readonly remediation = 'Provide a valid SemVer version string.'

  constructor(version: string, reason: string) {
    super(`Invalid version ${version}: ${reason}`, { version, reason })
  }
}

export class VersionNotIncreasing extends ReleaserError {
  readonly kind = 'VersionNotIncreasing'
  readonly remediation = 'Choose a version higher than both the local and published versions.'

  constructor(proposed: string, local: string, published: string | null) {
    super(
      `Version ${proposed} is not greater than local ${local}${published ? ` or published ${published}` : ''}`,
      {
        proposed,
        local,
        published,
      },
    )
  }
}

export class VersionAlreadyPublished extends ReleaserError {
  readonly kind = 'VersionAlreadyPublished'
  readonly remediation = 'The version already exists on the registry. Choose a different version.'

  constructor(version: string) {
    super(`Version ${version} is already published`, { version })
  }
}

export class PackagePrivate extends ReleaserError {
  readonly kind = 'PackagePrivate'
  readonly remediation = 'Set "private": false in package.json or remove the field.'

  constructor() {
    super('Package is marked as private')
  }
}

export class ReplacementMatchCount extends ReleaserError {
  readonly kind = 'ReplacementMatchCount'
  readonly remediation = 'Adjust the replacement pattern or expectedMatches count.'

  constructor(file: string, expected: number, actual: number) {
    super(`Replacement in ${file} matched ${actual} time(s), expected ${expected}`, {
      file,
      expected,
      actual,
    })
  }
}

export class NpmAuthFailed extends ReleaserError {
  readonly kind = 'NpmAuthFailed'
  readonly remediation = 'Run `npm login` or set NODE_AUTH_TOKEN.'
}

export class OtpRequired extends ReleaserError {
  readonly kind = 'OtpRequired'
  readonly remediation = 'Provide an OTP with --otp or use an automation token.'

  constructor() {
    super('npm requires a one-time password')
  }
}

export class LifecycleScriptFailed extends ReleaserError {
  readonly kind = 'LifecycleScriptFailed'
  readonly remediation = 'Fix the failing lifecycle script and retry.'

  constructor(script: string, output: string) {
    super(`Lifecycle script ${script} failed`, { script, output })
  }
}

export class GitHubAuthFailed extends ReleaserError {
  readonly kind = 'GitHubAuthFailed'
  readonly remediation = 'Set a valid GITHUB_TOKEN with appropriate permissions.'
}

export class GitHubApiError extends ReleaserError {
  readonly kind = 'GitHubApiError'
  readonly remediation = 'Check the GitHub API error details and retry.'

  constructor(message: string, status: number, details?: unknown) {
    super(message, { status, details })
  }
}

export class ReleaseExists extends ReleaserError {
  readonly kind = 'ReleaseExists'
  readonly remediation = 'The release already exists. Use --yes to skip or delete it first.'

  constructor(tag: string) {
    super(`GitHub Release for tag ${tag} already exists`, { tag })
  }
}

export class StalePlan extends ReleaserError {
  readonly kind = 'StalePlan'
  readonly remediation = 'Run `releaser plan` again to create a new plan.'

  constructor(field: string, expected: unknown, actual: unknown) {
    super(`Plan is stale: ${field} changed`, { field, expected, actual })
  }
}

export class JournalLocked extends ReleaserError {
  readonly kind = 'JournalLocked'
  readonly remediation = 'Wait for the other process to finish, or remove the stale lock file.'

  constructor(lockPath: string, pid: number) {
    super(`Journal is locked by PID ${pid}`, { lockPath, pid })
  }
}

export class PartialRelease extends ReleaserError {
  readonly kind = 'PartialRelease'
  readonly remediation = 'Run `releaser resume` to complete the release.'

  constructor(completedStages: string[], failedStage?: string) {
    super('Release partially completed', { completedStages, failedStage })
  }
}

export class CommandFailed extends ReleaserError {
  readonly kind = 'CommandFailed'
  readonly remediation = 'Check the command output and retry.'

  constructor(command: string, exitCode: number, stdout: string, stderr: string) {
    super(`Command failed: ${command}`, { command, exitCode, stdout, stderr })
  }
}

export class InvalidReleasePlan extends ReleaserError {
  readonly kind = 'InvalidReleasePlan'
  readonly remediation = 'Discard the stored plan and run `releaser plan` again.'

  constructor(source: string, issues: unknown) {
    super(`Release plan in ${source} is not valid`, { source, issues })
  }
}

export class CommandExecutionFailed extends ReleaserError {
  readonly kind = 'CommandExecutionFailed'
  readonly remediation = 'Ensure the executable is installed and on PATH, then retry.'

  constructor(command: string, reason: string, details?: unknown) {
    super(`Could not execute ${command}: ${reason}`, details)
  }
}

export class ConfigurationError extends ReleaserError {
  readonly kind = 'ConfigurationError'
  readonly remediation = 'Fix the configuration error and retry.'
}

export function isReleaserError(error: unknown): error is ReleaserError {
  return error instanceof ReleaserError
}
