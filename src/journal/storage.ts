import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { JournalLocked } from '../domain/errors.js'
import type { ReleasePlan } from '../domain/release-plan.js'
import type { Logger } from '../shared/logger.js'
import { silentLogger } from '../shared/logger.js'
import { defaultRedactor, type Redactor } from '../shared/redaction.js'
import { parseJournalJson, parseLockJson } from './journal-schema.js'
import {
  RELEASE_JOURNAL_SCHEMA_VERSION,
  type JournalEntry,
  type JournalLock,
  type JournalPaths,
  type ReleaseJournal,
} from './types.js'

const STALE_LOCK_MILLISECONDS = 60 * 60 * 1000

export type JournalStorageOptions = {
  stateHome?: string
  now?: () => Date
  pid?: number
  isProcessAlive?: (pid: number) => boolean
  logger?: Logger
  redactor?: Redactor
}

export type JournalSession = {
  paths: JournalPaths
  read(): Promise<ReleaseJournal | null>
  initialize(plan: ReleasePlan): Promise<ReleaseJournal>
  append(entry: Omit<JournalEntry, 'sequence' | 'recordedAt'>): Promise<ReleaseJournal>
  complete(): Promise<ReleaseJournal>
  release(): Promise<void>
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function stateDirectory(options: JournalStorageOptions): string {
  return options.stateHome ?? process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state')
}

export async function journalPaths(
  repositoryRoot: string,
  options: JournalStorageOptions = {},
): Promise<JournalPaths> {
  const root = await realpath(repositoryRoot)
  const id = createHash('sha256').update(root).digest('hex').slice(0, 16)
  const directory = join(stateDirectory(options), 'releaser', 'journals')
  return {
    id,
    directory,
    journal: join(directory, `${id}.json`),
    lock: join(directory, `${id}.lock`),
  }
}

async function atomicWrite(path: string, value: unknown, redactor: Redactor): Promise<void> {
  const safeValue = redactor.redactValue(value)
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o600,
  )
  try {
    await handle.writeFile(`${JSON.stringify(safeValue, null, 2)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temporary, path)
    const directory = await open(dirname(path), constants.O_RDONLY)
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function lockIsStale(
  lock: JournalLock,
  now: Date,
  isProcessAlive: (pid: number) => boolean,
): boolean {
  return (
    !isProcessAlive(lock.pid) ||
    now.getTime() - Date.parse(lock.startedAt) > STALE_LOCK_MILLISECONDS
  )
}

async function acquireLock(
  paths: JournalPaths,
  lock: JournalLock,
  options: JournalStorageOptions,
): Promise<void> {
  const logger = options.logger ?? silentLogger
  try {
    const handle = await open(
      paths.lock,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    )
    try {
      await handle.writeFile(`${JSON.stringify(lock)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
  }

  const existingJson = await readFile(paths.lock, 'utf8')
  const existing = parseLockJson(existingJson, paths.lock)
  const now = options.now?.() ?? new Date()
  if (!lockIsStale(existing, now, options.isProcessAlive ?? processIsAlive)) {
    throw new JournalLocked(paths.lock, existing.pid)
  }

  logger.warn('Breaking stale release journal lock', { path: paths.lock, pid: existing.pid })
  await rm(paths.lock)
  return acquireLock(paths, lock, options)
}

export async function openJournalSession(
  repositoryRoot: string,
  options: JournalStorageOptions = {},
): Promise<JournalSession> {
  const paths = await journalPaths(repositoryRoot, options)
  await mkdir(paths.directory, { recursive: true, mode: 0o700 })
  const lock: JournalLock = {
    pid: options.pid ?? process.pid,
    startedAt: (options.now?.() ?? new Date()).toISOString(),
  }
  await acquireLock(paths, lock, options)
  const redactor = options.redactor ?? defaultRedactor

  async function read(): Promise<ReleaseJournal | null> {
    const json = await readOptional(paths.journal)
    return json === null ? null : parseJournalJson(json, paths.journal)
  }

  async function write(journal: ReleaseJournal): Promise<ReleaseJournal> {
    await atomicWrite(paths.journal, journal, redactor)
    return journal
  }

  return {
    paths,
    read,
    async initialize(plan): Promise<ReleaseJournal> {
      const existing = await read()
      if (existing !== null && existing.completedAt === null) {
        return existing
      }
      return write({
        schemaVersion: RELEASE_JOURNAL_SCHEMA_VERSION,
        plan,
        entries: [],
        completedAt: null,
      })
    },
    async append(entry): Promise<ReleaseJournal> {
      const current = await read()
      if (current === null) {
        throw new Error(`Journal does not exist: ${paths.journal}`)
      }
      return write({
        ...current,
        entries: [
          ...current.entries,
          {
            ...entry,
            sequence: current.entries.length,
            recordedAt: (options.now?.() ?? new Date()).toISOString(),
          },
        ],
      })
    },
    async complete(): Promise<ReleaseJournal> {
      const current = await read()
      if (current === null) {
        throw new Error(`Journal does not exist: ${paths.journal}`)
      }
      return write({ ...current, completedAt: (options.now?.() ?? new Date()).toISOString() })
    },
    async release(): Promise<void> {
      const json = await readOptional(paths.lock)
      if (json === null) {
        return
      }
      const existing = parseLockJson(json, paths.lock)
      if (existing.pid === lock.pid && existing.startedAt === lock.startedAt) {
        await rm(paths.lock)
      }
    },
  }
}

export async function journalExists(
  repositoryRoot: string,
  options: JournalStorageOptions = {},
): Promise<boolean> {
  const paths = await journalPaths(repositoryRoot, options)
  try {
    await stat(paths.journal)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}
