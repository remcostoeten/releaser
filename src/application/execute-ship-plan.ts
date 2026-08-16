import { StalePlan } from '../domain/errors.js'
import type { RepositoryLookup } from './ports.js'
import type { BranchName, Sha } from '../domain/semantic.js'
import type { ShipPlan, ShipResult } from '../domain/ship-plan.js'

export type ExecuteShipPlanDependencies = {
  readRepository(): Promise<RepositoryLookup>
  resolveRemoteBranch(remote: string, branch: BranchName): Promise<Sha | null>
  commitAll(message: string): Promise<Sha>
  fetchTarget(remote: string, target: BranchName): Promise<void>
  checkoutTarget(remote: string, target: BranchName, existsLocally: boolean): Promise<void>
  restoreSource(source: BranchName): Promise<void>
  fastForwardTarget(remote: string, target: BranchName): Promise<void>
  mergeFeature(source: BranchName, target: BranchName, message: string): Promise<Sha>
}

function assertSourceState(lookup: RepositoryLookup, plan: ShipPlan): void {
  if (lookup.kind === 'not-a-repository') {
    throw new StalePlan('repositoryRoot', plan.repositoryRoot, lookup.path)
  }
  const { state } = lookup
  if (state.head.kind !== 'branch' || state.head.branch !== plan.sourceBranch) {
    throw new StalePlan(
      'sourceBranch',
      plan.sourceBranch,
      state.head.kind === 'branch' ? state.head.branch : 'detached',
    )
  }
  if (state.head.sha !== plan.sourceHeadSha) {
    throw new StalePlan('headSha', plan.sourceHeadSha, state.head.sha)
  }
  if (state.statusDigest !== plan.sourceStatusDigest) {
    throw new StalePlan('statusDigest', plan.sourceStatusDigest, state.statusDigest)
  }
}

export async function executeShipPlan(
  deps: ExecuteShipPlanDependencies,
  plan: ShipPlan,
): Promise<ShipResult> {
  assertSourceState(await deps.readRepository(), plan)
  const remoteSha = await deps.resolveRemoteBranch(plan.remote, plan.targetBranch)
  if (remoteSha !== plan.targetRemoteSha) {
    throw new StalePlan('targetRemoteSha', plan.targetRemoteSha, remoteSha)
  }
  const featureCommitSha =
    plan.featureCommit.kind === 'create'
      ? await deps.commitAll(plan.featureCommit.message)
      : plan.sourceHeadSha
  await deps.fetchTarget(plan.remote, plan.targetBranch)
  const fetchedRemoteSha = await deps.resolveRemoteBranch(plan.remote, plan.targetBranch)
  if (fetchedRemoteSha !== plan.targetRemoteSha) {
    throw new StalePlan('targetRemoteSha', plan.targetRemoteSha, fetchedRemoteSha)
  }
  let mergeCommitSha: Sha
  try {
    await deps.checkoutTarget(plan.remote, plan.targetBranch, plan.targetLocalSha !== null)
    if (plan.targetState === 'behind') {
      await deps.fastForwardTarget(plan.remote, plan.targetBranch)
    }
    mergeCommitSha = await deps.mergeFeature(
      plan.sourceBranch,
      plan.targetBranch,
      plan.mergeMessage,
    )
  } catch (error) {
    await deps.restoreSource(plan.sourceBranch)
    throw error
  }
  return { featureCommitSha, mergeCommitSha, targetBranch: plan.targetBranch }
}
