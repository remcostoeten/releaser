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
import type { StageName } from './stages.js'
import type { ReleaseVersion } from './version.js'

export const RELEASE_PLAN_SCHEMA_VERSION = 1

export type ReleasePlan = Readonly<{
  schemaVersion: 1
  id: string
  createdAt: string
  repositoryRoot: string
  packageName: string
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

export function planStages(plan: ReleasePlan): StageName[] {
  const stages: StageName[] = ['mutate-files', 'commit', 'tag', 'push-branch', 'push-tag']

  if (plan.npmPublish.kind === 'publish') {
    stages.push('npm-publish')
  }

  if (plan.githubRelease.kind === 'create') {
    stages.push('github-release')
  }

  return stages
}
