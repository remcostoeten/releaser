import type {
  GitCommitAction,
  GitHubReleaseAction,
  GitPushAction,
  GitTagAction,
  NpmPublishAction,
} from './actions.js'
import type { FileMutation } from './mutations.js'

export type StageName =
  | 'mutate-files'
  | 'commit'
  | 'tag'
  | 'push-branch'
  | 'push-tag'
  | 'npm-publish'
  | 'github-release'

export const STAGE_ORDER: StageName[] = [
  'mutate-files',
  'commit',
  'tag',
  'push-branch',
  'push-tag',
  'npm-publish',
  'github-release',
]

export type StageOutcome = 'pending' | 'running' | 'succeeded' | 'skipped' | 'failed' | 'unknown'

/**
 * What each stage is to do, keyed by the stage that does it. The executor
 * dispatches on `stage` and the compiler makes the switch exhaustive, so a new
 * stage cannot be added without giving it a position in this list — and the
 * order of that list is the irreversibility gradient of SPEC §7.2, not a
 * presentation detail.
 */
export type StageAction =
  | { stage: 'mutate-files'; mutations: readonly FileMutation[] }
  | { stage: 'commit'; commit: GitCommitAction }
  | { stage: 'tag'; tag: GitTagAction }
  | { stage: 'push-branch'; push: GitPushAction }
  | { stage: 'push-tag'; push: GitPushAction }
  | { stage: 'npm-publish'; publish: Extract<NpmPublishAction, { kind: 'publish' }> }
  | { stage: 'github-release'; release: Extract<GitHubReleaseAction, { kind: 'create' }> }

export function stageIndex(stage: StageName): number {
  return STAGE_ORDER.indexOf(stage)
}

export function isBefore(stage: StageName, other: StageName): boolean {
  return stageIndex(stage) < stageIndex(other)
}
