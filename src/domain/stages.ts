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
