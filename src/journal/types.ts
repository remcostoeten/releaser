import type { ReleasePlan } from '../domain/release-plan.js'
import type { StageName, StageOutcome } from '../domain/stages.js'

export const RELEASE_JOURNAL_SCHEMA_VERSION = 1

export type JournalEntry = Readonly<{
  sequence: number
  stage: StageName
  outcome: Exclude<StageOutcome, 'pending'>
  recordedAt: string
  details?: unknown
}>

export type ReleaseJournal = Readonly<{
  schemaVersion: 1
  plan: ReleasePlan
  entries: readonly JournalEntry[]
  completedAt: string | null
}>

export type JournalPaths = Readonly<{
  id: string
  directory: string
  journal: string
  lock: string
}>

export type JournalLock = Readonly<{
  pid: number
  startedAt: string
}>
