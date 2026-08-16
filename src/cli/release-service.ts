import { randomUUID } from 'node:crypto'
import { createExecutionDependencies } from '../application/create-execution-dependencies.js'
import { createNotesReader } from '../application/create-notes-reader.js'
import { createReleasePlan } from '../application/create-release-plan.js'
import { executeReleasePlan, resumeWithSession } from '../application/execute-release-plan.js'
import type { CreateReleasePlanResult } from '../application/create-release-plan.js'
import { loadConfig } from '../config/load.js'
import { isBlocked, unoverridableBlockers } from '../domain/checks.js'
import { GitHubAuthFailed, InvalidJournal, PreflightFailed, UsageError } from '../domain/errors.js'
import type { ReleasePlan } from '../domain/release-plan.js'
import type { ReleaseCheckId } from '../domain/checks.js'
import { PlanId, ReleasePlanCreatedAt } from '../domain/semantic.js'
import type { VersionSelection } from '../domain/version.js'
import { createGitReader } from '../git/git-reader.js'
import { createGitHubClient } from '../github/github-client.js'
import { createGitHubReader } from '../github/github-reader.js'
import { resolveGitHubToken } from '../github/token.js'
import { openJournalSession } from '../journal/storage.js'
import { createNpmClient } from '../npm/npm-client.js'
import { createPackageReader } from '../npm/package.js'
import { createCommandRunner } from '../shared/command-runner.js'
import { defaultRedactor } from '../shared/redaction.js'
import { createMutationPlanner } from '../versioning/mutation-planner.js'
import { createVersionScanner } from '../versioning/scanner.js'
import { EXIT_CODES } from './exit-codes.js'
import { resolveWorkingDirectory } from './resolve-cwd.js'

export type ReleaseCommandOptions = {
  cwd?: string
  bump?: string
  version?: string
  tag?: string
  dryRun?: boolean
  yes?: boolean
  interactive?: boolean
  verbose?: boolean
  otp?: string
  requestOtp?: () => Promise<string | null>
  acceptedOverrideCheckIds?: readonly ReleaseCheckId[]
}

function versionSelection(options: ReleaseCommandOptions): VersionSelection {
  if (options.bump !== undefined && options.version !== undefined) {
    throw new UsageError('--bump and --version cannot be used together')
  }
  if (options.version !== undefined) {
    return { kind: 'custom', version: options.version }
  }
  if (options.bump === 'patch' || options.bump === 'minor' || options.bump === 'major') {
    return { kind: 'bump', bump: options.bump }
  }
  if (options.bump === 'prerelease') {
    return { kind: 'prerelease', identifier: null }
  }
  throw new UsageError('Provide --bump <patch|minor|major|prerelease> or --version <semver>.')
}

async function repositoryRoot(cwd: string | undefined): Promise<string> {
  const candidate = await resolveWorkingDirectory(cwd)
  const runner = createCommandRunner()
  const location = await createGitReader(runner, { cwd: candidate, remote: 'origin' }).locate()
  return location.kind === 'not-a-repository' ? candidate : location.root
}

function commandVersion(output: string, prefix: RegExp): string | null {
  return prefix.exec(output)?.[1] ?? null
}

async function withSignalHandling<T>(repository: string, operation: () => Promise<T>): Promise<T> {
  function handleSignal(): never {
    console.error(`Release interrupted. Run releaser resume --cwd ${JSON.stringify(repository)}.`)
    process.exit(EXIT_CODES.partialRelease)
  }

  process.once('SIGINT', handleSignal)
  process.once('SIGTERM', handleSignal)
  try {
    return await operation()
  } finally {
    process.off('SIGINT', handleSignal)
    process.off('SIGTERM', handleSignal)
  }
}

async function buildPlan(options: ReleaseCommandOptions): Promise<CreateReleasePlanResult> {
  const root = await repositoryRoot(options.cwd)
  const config = await loadConfig(root)
  const runner = createCommandRunner()
  const git = createGitReader(runner, { cwd: root, remote: config.remote })
  const npm = createNpmClient(runner, root)
  const github = createGitHubReader({ readRemoteRepository: git.readRemoteRepository })
  return createReleasePlan(
    {
      toolchain: {
        async readGitVersion() {
          const result = await runner.run('git', ['--version'])
          return result.exitCode === 0
            ? commandVersion(result.stdout, /git version (\d+\.\d+\.\d+)/u)
            : null
        },
        async readNpmVersion() {
          const result = await runner.run('npm', ['--version'])
          return result.exitCode === 0 ? result.stdout.trim() : null
        },
      },
      repository: {
        async readState() {
          const state = await git.readState()
          return state.kind === 'no-commits'
            ? { kind: 'not-a-repository' as const, path: state.root }
            : state
        },
        findPreviousRelease: git.findPreviousRelease,
        localTagExists: git.localTagExists,
        remoteTagExists: (_remote, tag) => git.remoteTagExists(tag),
      },
      manifest: createPackageReader(root, config.versionFile),
      registry: npm,
      github,
      mutations: createMutationPlanner(root, config),
      notes: createNotesReader({
        readCommits: (boundary) =>
          git.readCommits({
            from: boundary.kind === 'initial' ? null : boundary.previousSha,
            to: boundary.headSha,
          }),
        readPullRequests: (repository, commitShas) =>
          github.readMergedPullRequests(repository, commitShas),
      }),
      clock: {
        now: () => ReleasePlanCreatedAt.from(new Date().toISOString(), 'the system clock'),
      },
      ids: { next: () => PlanId.from(randomUUID(), 'a generated plan id') },
    },
    { config, selection: versionSelection(options), explicitDistTag: options.tag ?? null },
  )
}

function assertExecutablePlan(
  result: CreateReleasePlanResult,
  acceptedOverrides: readonly ReleaseCheckId[],
): asserts result is Extract<CreateReleasePlanResult, { kind: 'planned' }> {
  if (result.kind !== 'planned' || unoverridableBlockers(result.checks).length > 0) {
    throw new PreflightFailed(result.checks)
  }
  const unaccepted = result.checks.filter(
    (check) => check.outcome === 'blocked' && !acceptedOverrides.includes(check.id),
  )
  if (isBlocked(unaccepted)) {
    throw new PreflightFailed(result.checks)
  }
}

export async function planRelease(
  options: ReleaseCommandOptions,
): Promise<CreateReleasePlanResult> {
  return buildPlan(options)
}

export async function doctorRelease(options: ReleaseCommandOptions) {
  const selection =
    options.bump === undefined && options.version === undefined
      ? { ...options, bump: 'patch' }
      : options
  const result = await buildPlan(selection)
  return { kind: 'doctor', checks: result.checks }
}

export async function scanRelease(options: ReleaseCommandOptions) {
  const root = await repositoryRoot(options.cwd)
  const config = await loadConfig(root)
  const manifest = await createPackageReader(root, config.versionFile).read()
  if (manifest.kind !== 'found') {
    throw new UsageError(`Cannot read ${manifest.path}: ${manifest.reason}`)
  }
  const occurrences = await createVersionScanner(createCommandRunner(), root).scan(
    manifest.manifest.version,
  )
  return { kind: 'scan', version: manifest.manifest.version, occurrences }
}

export async function readReleaseStatus(options: ReleaseCommandOptions) {
  const root = await repositoryRoot(options.cwd)
  const config = await loadConfig(root)
  const runner = createCommandRunner()
  const git = createGitReader(runner, { cwd: root, remote: config.remote })
  const npm = createNpmClient(runner, root)
  const [repository, manifest] = await Promise.all([
    git.readState(),
    createPackageReader(root, config.versionFile).read(),
  ])
  const registry =
    config.npm.publish && manifest.kind === 'found'
      ? await npm.readPublishedVersions(manifest.manifest.name)
      : config.npm.publish
        ? { kind: 'unavailable' as const }
        : { kind: 'skipped' as const, reason: 'npm publication is disabled' }
  return { kind: 'status', repository, manifest, registry }
}

export async function runRelease(options: ReleaseCommandOptions) {
  const planned = await buildPlan(options)
  const accepted =
    options.yes === true
      ? planned.checks.flatMap((check) =>
          check.outcome === 'blocked' && check.overridable ? [check.id] : [],
        )
      : (options.acceptedOverrideCheckIds ?? [])
  assertExecutablePlan(planned, accepted)
  return executePlannedRelease(planned.plan, options)
}

export async function executePlannedRelease(plan: ReleasePlan, options: ReleaseCommandOptions) {
  if (options.otp !== undefined) {
    defaultRedactor.registerSecret(options.otp)
  }
  const runner = createCommandRunner()
  const git = createGitReader(runner, {
    cwd: plan.repositoryRoot,
    remote: plan.pushBranch.remote,
  })
  const npm = createNpmClient(runner, plan.repositoryRoot)
  const token = resolveGitHubToken()
  const github =
    plan.githubRelease.kind === 'create'
      ? token === null
        ? (() => {
            throw new GitHubAuthFailed('missing')
          })()
        : createGitHubClient(token.value)
      : null
  function operation() {
    return executeReleasePlan(createExecutionDependencies({ git, npm, github }), plan, {
      ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
      ...(options.interactive === undefined ? {} : { interactive: options.interactive }),
      ...(options.otp === undefined ? {} : { otp: options.otp }),
      ...(options.requestOtp === undefined ? {} : { requestOtp: options.requestOtp }),
    })
  }
  return options.dryRun === true ? operation() : withSignalHandling(plan.repositoryRoot, operation)
}

export async function resumeReleaseFromCli(options: ReleaseCommandOptions) {
  const root = await repositoryRoot(options.cwd)
  const session = await openJournalSession(root)
  try {
    const stored = await session.read()
    if (stored === null) {
      throw new InvalidJournal(session.paths.journal, 'No journal exists for this repository')
    }
    const runner = createCommandRunner()
    const git = createGitReader(runner, {
      cwd: stored.plan.repositoryRoot,
      remote: stored.plan.pushBranch.remote,
    })
    const npm = createNpmClient(runner, stored.plan.repositoryRoot)
    const token = resolveGitHubToken()
    if (stored.plan.githubRelease.kind === 'create' && token === null) {
      throw new GitHubAuthFailed('missing')
    }
    const github =
      stored.plan.githubRelease.kind === 'create' && token !== null
        ? createGitHubClient(token.value)
        : null
    const deps = createExecutionDependencies({ git, npm, github })
    return await withSignalHandling(root, () =>
      resumeWithSession(deps, stored, session, {
        ...(options.interactive === undefined ? {} : { interactive: options.interactive }),
        ...(options.otp === undefined ? {} : { otp: options.otp }),
        ...(options.requestOtp === undefined ? {} : { requestOtp: options.requestOtp }),
      }),
    )
  } finally {
    await session.release()
  }
}
