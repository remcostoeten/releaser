export type ChangeCategory =
  | 'breaking'
  | 'features'
  | 'fixes'
  | 'performance'
  | 'documentation'
  | 'dependencies'
  | 'maintenance'
  | 'other'

export const CHANGE_CATEGORIES: ChangeCategory[] = [
  'breaking',
  'features',
  'fixes',
  'performance',
  'documentation',
  'dependencies',
  'maintenance',
  'other',
]

export type CommitSummary = {
  sha: string
  subject: string
  body: string
  author: string
  authoredAt: string
  parents: string[]
}

export type PullRequestSummary = {
  number: number
  title: string
  author: string
  mergedAt: string
  mergeCommitSha: string | null
  labels: string[]
}

export type ChangeOrigin =
  | { kind: 'commit'; sha: string }
  | { kind: 'pull-request'; number: number; mergeCommitSha: string | null }

export type Change = {
  id: string
  title: string
  category: ChangeCategory
  author: string | null
  origin: ChangeOrigin
}
