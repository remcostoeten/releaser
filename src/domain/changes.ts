import type { Iso8601, Sha } from './semantic.js'

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
  sha: Sha
  subject: string
  body: string
  author: string
  authoredAt: Iso8601
  parents: Sha[]
}

export type PullRequestSummary = {
  number: number
  title: string
  author: string
  mergedAt: Iso8601
  mergeCommitSha: Sha | null
  labels: string[]
}

export type ChangeOrigin =
  | { kind: 'commit'; sha: Sha }
  | { kind: 'pull-request'; number: number; mergeCommitSha: Sha | null }

export type Change = {
  id: string
  title: string
  category: ChangeCategory
  author: string | null
  origin: ChangeOrigin
}
