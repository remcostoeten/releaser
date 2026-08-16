import { FinalizeTimedOut, UsageError, WorkflowRunsFailed } from '../domain/errors.js'
import type { GitHubRelease, GitHubWorkflowRun } from '../github/types.js'

export type FinalizeReleaseDependencies = {
  readReleaseByTag(tag: string): Promise<GitHubRelease | null>
  readWorkflowRunsForRef(ref: string): Promise<GitHubWorkflowRun[]>
  publishRelease(releaseId: number): Promise<GitHubRelease>
  sleep(milliseconds: number): Promise<void>
  log(message: string): void
}

export type FinalizeReleaseRequest = {
  tag: string
  wait: boolean
  pollIntervalMs: number
  timeoutMs: number
}

export type FinalizeReleaseResult =
  | { kind: 'already-published'; release: GitHubRelease }
  | { kind: 'published'; release: GitHubRelease }

const PASSING_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])

function failedRuns(runs: readonly GitHubWorkflowRun[]): string[] {
  return runs
    .filter(
      (run) =>
        run.status === 'completed' &&
        run.conclusion !== null &&
        !PASSING_CONCLUSIONS.has(run.conclusion),
    )
    .map((run) => run.name)
}

function pendingRuns(runs: readonly GitHubWorkflowRun[]): string[] {
  return runs.filter((run) => run.status !== 'completed').map((run) => run.name)
}

async function awaitWorkflowRuns(
  deps: FinalizeReleaseDependencies,
  request: FinalizeReleaseRequest,
  waitedMs: number,
): Promise<void> {
  const runs = await deps.readWorkflowRunsForRef(request.tag)
  const failed = failedRuns(runs)
  if (failed.length > 0) {
    throw new WorkflowRunsFailed(request.tag, failed)
  }
  // Zero runs also counts as pending: the tag push may not have
  // triggered its workflows yet when finalize starts polling.
  const pending = pendingRuns(runs)
  if (runs.length > 0 && pending.length === 0) {
    deps.log(`All ${runs.length} workflow runs for ${request.tag} succeeded`)
    return
  }
  if (waitedMs >= request.timeoutMs) {
    throw new FinalizeTimedOut(request.tag, waitedMs)
  }
  deps.log(
    runs.length === 0
      ? `No workflow runs for ${request.tag} yet; waiting`
      : `Waiting for ${pending.length} of ${runs.length} workflow runs: ${pending.join(', ')}`,
  )
  await deps.sleep(request.pollIntervalMs)
  return awaitWorkflowRuns(deps, request, waitedMs + request.pollIntervalMs)
}

export async function finalizeRelease(
  deps: FinalizeReleaseDependencies,
  request: FinalizeReleaseRequest,
): Promise<FinalizeReleaseResult> {
  const release = await deps.readReleaseByTag(request.tag)
  if (release === null) {
    throw new UsageError(
      `No GitHub release exists for tag ${request.tag}; wait for CI to create the draft or check the tag name.`,
    )
  }
  if (!release.draft) {
    return { kind: 'already-published', release }
  }
  if (request.wait) {
    await awaitWorkflowRuns(deps, request, 0)
  }
  const published = await deps.publishRelease(release.id)
  return { kind: 'published', release: published }
}
