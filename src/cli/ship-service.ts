import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createShipPlan, type CreateShipPlanRequest } from '../application/create-ship-plan.js'
import { executeShipPlan } from '../application/execute-ship-plan.js'
import { loadConfig } from '../config/load.js'
import {
  BranchName,
  NotAGitRepository,
  type ShipPlan,
  type ShipResult,
  UsageError,
} from '../domain/index.js'
import {
  checkoutBranch,
  checkoutTargetBranch,
  commitAllChanges,
  fastForwardTarget,
  fetchTargetBranch,
  mergeFeatureBranch,
  operationInProgress,
  isAncestor,
  readRemoteBranchSha,
  resolveBranchSha,
  createGitReader,
} from '../git/index.js'
import { createCommandRunner } from '../shared/command-runner.js'
import type { ReleaseCommandOptions } from './release-service.js'

export type ShipCommandOptions = ReleaseCommandOptions & {
  source?: string
  target?: string
  message?: string
  mergeMessage?: string
}

export type ShipContext = Readonly<{
  repositoryRoot: string
  sourceBranch: BranchName
  targetBranch: BranchName
  remote: string
  changes: readonly string[]
}>

async function repositoryRoot(cwd: string | undefined): Promise<string> {
  const candidate = await realpath(resolve(cwd ?? process.cwd()))
  const runner = createCommandRunner()
  const location = await createGitReader(runner, { cwd: candidate, remote: 'origin' }).locate()
  if (location.kind === 'not-a-repository') {
    throw new NotAGitRepository(candidate)
  }
  return location.root
}

async function detectTargetBranch(
  git: ReturnType<typeof createGitReader>,
  configured: string | null,
  detected: BranchName | null,
  explicit: string | undefined,
): Promise<string | null> {
  if (explicit !== undefined) {
    return explicit
  }
  if (configured !== null) {
    return configured
  }
  if (detected !== null) {
    return detected
  }
  const candidates = ['main', 'master'] as const
  const matches = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      exists:
        (await git.readRemoteBranchSha(
          BranchName.from(candidate, 'a conventional release branch'),
        )) !== null,
    })),
  )
  return matches.find((match) => match.exists)?.candidate ?? null
}

export async function inspectShip(options: ShipCommandOptions): Promise<ShipContext> {
  const root = await repositoryRoot(options.cwd)
  const config = await loadConfig(root)
  const git = createGitReader(createCommandRunner(), { cwd: root, remote: config.remote })
  const lookup = await git.readState()
  if (lookup.kind !== 'found') {
    throw new NotAGitRepository(root)
  }
  if (lookup.state.head.kind !== 'branch') {
    throw new UsageError('Check out the feature branch before running releaser ship.')
  }
  const sourceBranch =
    options.source === undefined
      ? lookup.state.head.branch
      : BranchName.from(options.source, 'the ship source branch')
  if (sourceBranch !== lookup.state.head.branch) {
    throw new UsageError(
      `Source branch ${sourceBranch} is not checked out; check it out or omit the source argument.`,
    )
  }
  const targetName = await detectTargetBranch(
    git,
    config.releaseBranch,
    lookup.state.defaultBranch,
    options.target,
  )
  if (targetName === null) {
    throw new UsageError('Cannot detect the release branch; pass --target <branch>.')
  }
  return {
    repositoryRoot: root,
    sourceBranch,
    targetBranch: BranchName.from(targetName, 'the ship target branch'),
    remote: config.remote,
    changes: lookup.state.workingTree.kind === 'dirty' ? lookup.state.workingTree.entries : [],
  }
}

export async function planShip(options: ShipCommandOptions): Promise<ShipPlan> {
  const context = await inspectShip(options)
  const runner = createCommandRunner()
  const git = createGitReader(runner, {
    cwd: context.repositoryRoot,
    remote: context.remote,
  })
  const request: CreateShipPlanRequest = {
    targetBranch: context.targetBranch,
    remote: context.remote,
    commitMessage: options.message?.trim() || null,
    mergeMessage: options.mergeMessage?.trim() || null,
  }
  return createShipPlan(
    {
      async readRepository() {
        const state = await git.readState()
        return state.kind === 'found'
          ? state
          : { kind: 'not-a-repository' as const, path: context.repositoryRoot }
      },
      resolveLocalBranch: (branch) => resolveBranchSha(git.command, branch),
      resolveRemoteBranch: (remote, branch) => readRemoteBranchSha(git.command, remote, branch),
      isAncestor: (ancestor, descendant) => isAncestor(git.command, ancestor, descendant),
      operationInProgress: () => operationInProgress(git.command),
    },
    request,
  )
}

export function prepareShip(plan: ShipPlan): Promise<ShipResult> {
  const runner = createCommandRunner()
  const git = createGitReader(runner, {
    cwd: plan.repositoryRoot,
    remote: plan.remote,
  })
  return executeShipPlan(
    {
      async readRepository() {
        const state = await git.readState()
        return state.kind === 'found'
          ? state
          : { kind: 'not-a-repository' as const, path: plan.repositoryRoot }
      },
      resolveRemoteBranch: (remote, branch) => readRemoteBranchSha(git.command, remote, branch),
      commitAll: (message) => commitAllChanges(git.command, message),
      fetchTarget: (remote, target) => fetchTargetBranch(git.command, remote, target),
      checkoutTarget: (remote, target, existsLocally) =>
        checkoutTargetBranch(git.command, remote, target, existsLocally),
      restoreSource: (source) => checkoutBranch(git.command, source),
      fastForwardTarget: (remote, target) => fastForwardTarget(git.command, remote, target),
      mergeFeature: (source, target, message) =>
        mergeFeatureBranch(git.command, source, target, message),
    },
    plan,
  )
}
