import { z } from 'zod'
import { InvalidJournal } from '../domain/errors.js'
import { releasePlanSchema } from './release-plan-schema.js'
import type { JournalLock, ReleaseJournal } from './types.js'

const stageSchema = z.enum([
  'mutate-files',
  'commit',
  'tag',
  'push-branch',
  'push-tag',
  'npm-publish',
  'github-release',
])

const entrySchema = z.strictObject({
  sequence: z.number().int().nonnegative(),
  stage: stageSchema,
  outcome: z.enum(['running', 'succeeded', 'skipped', 'failed', 'unknown']),
  recordedAt: z.iso.datetime(),
  details: z.unknown().optional(),
})

const journalSchema = z.strictObject({
  schemaVersion: z.literal(1),
  plan: releasePlanSchema,
  entries: z.array(entrySchema).readonly(),
  completedAt: z.iso.datetime().nullable(),
})

const lockSchema = z.strictObject({
  pid: z.number().int().positive(),
  startedAt: z.iso.datetime(),
})

function issues(error: z.ZodError): unknown {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
}

export function parseReleaseJournal(input: unknown, source: string): ReleaseJournal {
  const result = journalSchema.safeParse(input)
  if (!result.success) {
    throw new InvalidJournal(source, issues(result.error))
  }
  return result.data
}

export function parseJournalLock(input: unknown, source: string): JournalLock {
  const result = lockSchema.safeParse(input)
  if (!result.success) {
    throw new InvalidJournal(source, issues(result.error))
  }
  return result.data
}

export function parseJournalJson(json: string, source: string): ReleaseJournal {
  try {
    return parseReleaseJournal(JSON.parse(json), source)
  } catch (error) {
    if (error instanceof InvalidJournal) {
      throw error
    }
    throw new InvalidJournal(source, error instanceof Error ? error.message : String(error))
  }
}

export function parseLockJson(json: string, source: string): JournalLock {
  try {
    return parseJournalLock(JSON.parse(json), source)
  } catch (error) {
    if (error instanceof InvalidJournal) {
      throw error
    }
    throw new InvalidJournal(source, error instanceof Error ? error.message : String(error))
  }
}
