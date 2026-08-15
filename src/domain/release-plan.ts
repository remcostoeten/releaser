import type {
  GitCommitAction,
  GitHubReleaseAction,
  GitPushAction,
  GitTagAction,
  NpmPublishAction,
} from './actions.js'
import type { FileMutation } from './mutations.js'
import type { ReleaseNotes } from './release-notes.js'
import type { ReleaseBoundary, RepositoryFingerprint } from './repository.js'
import type { AbsolutePath, Iso8601, PackageName, PlanId } from './semantic.js'
import type { StageAction, StageName } from './stages.js'
import type { ReleaseVersion } from './version.js'

export const RELEASE_PLAN_SCHEMA_VERSION = 1

export type ReleasePlan = Readonly<{
  schemaVersion: 1
  id: PlanId
  createdAt: Iso8601
  repositoryRoot: AbsolutePath
  packageName: PackageName
  fingerprint: RepositoryFingerprint
  boundary: ReleaseBoundary
  version: ReleaseVersion
  fileMutations: readonly FileMutation[]
  commit: GitCommitAction
  tag: GitTagAction
  pushBranch: GitPushAction
  pushTag: GitPushAction
  npmPublish: NpmPublishAction
  githubRelease: GitHubReleaseAction
  notes: ReleaseNotes
}>

export type ReleasePlanInput = Omit<ReleasePlan, 'schemaVersion'>

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  for (const entry of Object.values(value)) {
    deepFreeze(entry)
  }

  return Object.freeze(value)
}

export function createReleasePlan(input: ReleasePlanInput): ReleasePlan {
  return deepFreeze({ schemaVersion: RELEASE_PLAN_SCHEMA_VERSION, ...input } as ReleasePlan)
}

export function serializeReleasePlan(plan: ReleasePlan): string {
  return JSON.stringify(plan, null, 2)
}

/**
 * The stages this plan will run, in execution order, each carrying what it
 * needs. A skipped npm publish or GitHub release is absent rather than present
 * and inert, so the executor never has to ask a second time whether a stage
 * applies.
 */
export function planStageActions(plan: ReleasePlan): StageAction[] {
  const actions: StageAction[] = [
    { stage: 'mutate-files', mutations: plan.fileMutations },
    { stage: 'commit', commit: plan.commit },
    { stage: 'tag', tag: plan.tag },
    { stage: 'push-branch', push: plan.pushBranch },
    { stage: 'push-tag', push: plan.pushTag },
  ]

  if (plan.npmPublish.kind === 'publish') {
    actions.push({ stage: 'npm-publish', publish: plan.npmPublish })
  }

  if (plan.githubRelease.kind === 'create') {
    actions.push({ stage: 'github-release', release: plan.githubRelease })
  }

  return actions
}

export function planStages(plan: ReleasePlan): StageName[] {
  return planStageActions(plan).map((action) => action.stage)
}
