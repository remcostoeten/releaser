import {
  type BranchName,
  DetachedHead,
  NotAGitRepository,
  type RepositoryState,
  type Sha,
  type ShipPlan,
  type ShipTargetState,
  ShipTargetDiverged,
  UsageError,
} from '../domain/index.js'
import type { RepositoryLookup } from './ports.js'

export type CreateShipPlanDependencies = {
  readRepository(): Promise<RepositoryLookup>
  resolveLocalBranch(branch: BranchName): Promise<Sha | null>
  resolveRemoteBranch(remote: string, branch: BranchName): Promise<Sha | null>
  isAncestor(ancestor: Sha, descendant: Sha): Promise<boolean>
  operationInProgress(): Promise<boolean>
}

export type CreateShipPlanRequest = {
  targetBranch: BranchName
  remote: string
  commitMessage: string | null
  mergeMessage: string | null
}

type ShipSource = {
  state: RepositoryState
  sourceBranch: BranchName
  changes: string[]
  commitMessage: string
}

async function readShipSource(
  deps: CreateShipPlanDependencies,
  request: CreateShipPlanRequest,
): Promise<ShipSource> {
  const lookup = await deps.readRepository()
  if (lookup.kind === 'not-a-repository') {
    throw new NotAGitRepository(lookup.path)
  }
  const { state } = lookup
  if (state.head.kind === 'detached') {
    throw new DetachedHead()
  }
  if (await deps.operationInProgress()) {
    throw new UsageError(
      'Finish or abort the current Git merge, rebase, cherry-pick, or revert first.',
    )
  }
  if (state.head.branch === request.targetBranch) {
    throw new UsageError(
      `Already on the target branch ${request.targetBranch}; run releaser directly.`,
    )
  }
  const changes = state.workingTree.kind === 'dirty' ? state.workingTree.entries : []
  const commitMessage = request.commitMessage?.trim() ?? ''
  if (changes.length > 0 && commitMessage.length === 0) {
    throw new UsageError('Provide --message <commit-message> for the uncommitted feature changes.')
  }
  return { state, sourceBranch: state.head.branch, changes, commitMessage }
}

async function classifyTarget(
  deps: CreateShipPlanDependencies,
  local: Sha | null,
  remote: Sha,
  branch: BranchName,
): Promise<ShipTargetState> {
  if (local === null) {
    return 'missing'
  }
  if (local === remote) {
    return 'synchronized'
  }
  if (await deps.isAncestor(local, remote)) {
    return 'behind'
  }
  if (await deps.isAncestor(remote, local)) {
    return 'ahead'
  }
  throw new ShipTargetDiverged(branch)
}

export async function createShipPlan(
  deps: CreateShipPlanDependencies,
  request: CreateShipPlanRequest,
): Promise<ShipPlan> {
  const { state, sourceBranch, changes, commitMessage } = await readShipSource(deps, request)
  const [targetLocalSha, targetRemoteSha] = await Promise.all([
    deps.resolveLocalBranch(request.targetBranch),
    deps.resolveRemoteBranch(request.remote, request.targetBranch),
  ])
  if (targetRemoteSha === null) {
    throw new UsageError(`Remote branch ${request.remote}/${request.targetBranch} does not exist.`)
  }
  const containedLocally =
    targetLocalSha !== null && (await deps.isAncestor(state.head.sha, targetLocalSha))
  const containedRemotely = await deps.isAncestor(state.head.sha, targetRemoteSha)
  if (changes.length === 0 && (containedLocally || containedRemotely)) {
    throw new UsageError(`${sourceBranch} is already contained in ${request.targetBranch}.`)
  }
  const targetState = await classifyTarget(
    deps,
    targetLocalSha,
    targetRemoteSha,
    request.targetBranch,
  )
  const featureCommit: ShipPlan['featureCommit'] =
    changes.length === 0
      ? { kind: 'skip', reason: 'Feature changes are already committed' }
      : { kind: 'create', message: commitMessage }
  return Object.freeze({
    repositoryRoot: state.root,
    remote: request.remote,
    sourceBranch,
    targetBranch: request.targetBranch,
    sourceHeadSha: state.head.sha,
    sourceStatusDigest: state.statusDigest,
    targetLocalSha,
    targetRemoteSha,
    targetState,
    changes: Object.freeze(changes),
    featureCommit,
    mergeMessage:
      request.mergeMessage?.trim() || `Merge branch '${sourceBranch}' into ${request.targetBranch}`,
  })
}
