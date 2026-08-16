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

export class UsageError extends ReleaserError {
  readonly kind = 'UsageError'
  readonly remediation = 'Run `releaser --help` for valid command options.'
}

export class Cancelled extends ReleaserError {
  readonly kind = 'Cancelled'
  readonly remediation = 'Run the command again when you are ready.'

  constructor() {
    super('Release cancelled; nothing was changed')
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

export class ShipTargetDiverged extends ReleaserError {
  readonly kind = 'ShipTargetDiverged'
  readonly remediation =
    'Fetch the target branch, then reconcile the local and remote target branch before shipping.'

  constructor(branch: string) {
    super(`Local and remote ${branch} have diverged`, { branch })
  }
}

export class MergeConflict extends ReleaserError {
  readonly kind = 'MergeConflict'
  readonly remediation =
    'Resolve the feature branch against the target branch, then run ship again.'

  constructor(source: string, target: string, files: string[]) {
    super(`Could not merge ${source} into ${target}`, { source, target, files })
  }
}

export class CancelledAfterPreparation extends ReleaserError {
  readonly kind = 'CancelledAfterPreparation'
  readonly remediation =
    'Inspect the local merge, then run `releaser` to release it or reset it manually.'

  constructor(branch: string) {
    super(`Release cancelled after ${branch} was prepared locally`, { branch })
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

export class PublishedPackageMismatch extends ReleaserError {
  readonly kind = 'PublishedPackageMismatch'
  readonly remediation = 'Do not retry publication. Inspect the published tarball and repository.'

  constructor(packageVersion: string, expectedShasum: string, actualShasum: string) {
    super(`Published package ${packageVersion} does not match the local tarball`, {
      packageVersion,
      expectedShasum,
      actualShasum,
    })
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

  constructor(file: string, pattern: string, expected: number, actual: number) {
    super(`Replacement in ${file} matched ${actual} time(s), expected ${expected}`, {
      file,
      pattern,
      expected,
      actual,
    })
  }
}

export class NpmAuthFailed extends ReleaserError {
  readonly kind = 'NpmAuthFailed'
  readonly remediation = 'Run `npm login` or set NODE_AUTH_TOKEN.'
}

export class NpmRegistryUnavailable extends ReleaserError {
  readonly kind = 'NpmRegistryUnavailable'
  readonly remediation = 'Check the configured npm registry and network connection, then retry.'
}

export class NpmRegistryUnauthorized extends ReleaserError {
  readonly kind = 'NpmRegistryUnauthorized'
  readonly remediation = 'Run `npm login` with an account that can read this package.'

  constructor(packageName: string) {
    super(`npm denied access to ${packageName}`, { packageName })
  }
}

export class OtpRequired extends ReleaserError {
  readonly kind = 'OtpRequired'
  readonly remediation = 'Provide an OTP with --otp or use an automation token.'

  constructor(retryPossible = true) {
    super('npm requires a one-time password', { retryPossible })
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
  readonly remediation: string

  constructor(reason: 'missing' | 'invalid' | 'insufficient-permission') {
    const messages = {
      missing: 'No GitHub token was found',
      invalid: 'GitHub rejected the configured token',
      'insufficient-permission': 'GitHub token lacks contents: write permission',
    }
    const remediations = {
      missing: 'Set GITHUB_TOKEN or GH_TOKEN, or authenticate with `gh auth login`.',
      invalid: 'Replace GITHUB_TOKEN or GH_TOKEN with a valid token.',
      'insufficient-permission': 'Use a token with contents: write permission for this repository.',
    }
    super(messages[reason], { reason })
    this.remediation = remediations[reason]
  }
}

export class GitHubApiError extends ReleaserError {
  readonly kind = 'GitHubApiError'
  readonly remediation = 'Check the GitHub API error details and retry.'

  constructor(message: string, status: number, details?: unknown) {
    super(message, { status, details })
  }
}

export class WorkflowRunsFailed extends ReleaserError {
  readonly kind = 'WorkflowRunsFailed'
  readonly remediation =
    'Fix the failed workflow runs and re-run them, then run releaser finalize again.'

  constructor(tag: string, failed: readonly string[]) {
    super(`Workflow runs for ${tag} failed: ${failed.join(', ')}`, { tag, failed })
  }
}

export class FinalizeTimedOut extends ReleaserError {
  readonly kind = 'FinalizeTimedOut'
  readonly remediation =
    'Wait for the workflow runs to finish, then run releaser finalize again; it is safe to re-run.'

  constructor(tag: string, waitedMs: number) {
    super(`Timed out after ${Math.round(waitedMs / 60_000)}m waiting for workflow runs on ${tag}`, {
      tag,
      waitedMs,
    })
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

export class InvalidJournal extends ReleaserError {
  readonly kind = 'InvalidJournal'
  readonly remediation = 'Inspect the journal file and restore it from a valid backup, or re-plan.'

  constructor(source: string, issues: unknown) {
    super(`Release journal in ${source} is not valid`, { source, issues })
  }
}

export class PartialRelease extends ReleaserError {
  readonly kind = 'PartialRelease'
  readonly remediation: string

  constructor(
    completedStages: string[],
    failedStage?: string,
    remainingStages: string[] = [],
    resumeCommand = 'releaser resume',
    failure?: string,
  ) {
    super('Release partially completed', {
      completedStages,
      failedStage,
      remainingStages,
      resumeCommand,
      failure,
    })
    this.remediation = `Run \`${resumeCommand}\` to complete the release.`
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

export class PreflightFailed extends ReleaserError {
  readonly kind = 'PreflightFailed'
  readonly remediation = 'Resolve the blocking preflight checks and retry.'

  constructor(checks: unknown) {
    super('Release preflight failed', { checks })
  }
}

export class MalformedValue extends ReleaserError {
  readonly kind = 'MalformedValue'
  readonly remediation = 'This is a bug in releaser. Please report it with the command you ran.'

  constructor(typeName: string, value: string, context: string) {
    super(`${context} produced a value that is not a valid ${typeName}: ${value}`, {
      typeName,
      value,
      context,
    })
  }
}

export class UnreachableCase extends ReleaserError {
  readonly kind = 'UnreachableCase'
  readonly remediation = 'This is a bug in releaser. Please report it with the command you ran.'

  constructor(context: string, value: unknown) {
    super(`${context} reached a case the type system rules out`, { context, value })
  }
}

export function isReleaserError(error: unknown): error is ReleaserError {
  return error instanceof ReleaserError
}
