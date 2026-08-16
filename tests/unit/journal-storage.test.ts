import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvalidJournal, JournalLocked } from '../../src/domain/errors.js'
import { openJournalSession } from '../../src/journal/storage.js'
import { examplePlan } from '../helpers/plan-fixture.js'

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'releaser-journal-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('journal storage', () => {
  it('stores journals outside the repository and appends validated entries', async () => {
    const repository = await temporaryRoot()
    const stateHome = await temporaryRoot()
    const session = await openJournalSession(repository, { stateHome })
    const plan = { ...examplePlan(), repositoryRoot: repository } as ReturnType<typeof examplePlan>

    await session.initialize(plan)
    await session.append({ stage: 'mutate-files', outcome: 'running' })
    await session.append({
      stage: 'mutate-files',
      outcome: 'succeeded',
      details: { token: 'npm_secretsecretsecretsecret' },
    })
    await session.release()

    expect(session.paths.journal.startsWith(repository)).toBe(false)
    const stored = await readFile(session.paths.journal, 'utf8')
    expect(stored).not.toContain('npm_secretsecretsecretsecret')
    expect(JSON.parse(stored).entries).toHaveLength(2)
  })

  it('rejects a live lock', async () => {
    const repository = await temporaryRoot()
    const stateHome = await temporaryRoot()
    const first = await openJournalSession(repository, {
      stateHome,
      pid: 123,
      isProcessAlive: () => true,
    })

    await expect(
      openJournalSession(repository, { stateHome, pid: 456, isProcessAlive: () => true }),
    ).rejects.toBeInstanceOf(JournalLocked)
    await first.release()
  })

  it('breaks a stale lock and warns', async () => {
    const repository = await temporaryRoot()
    const stateHome = await temporaryRoot()
    const warn = vi.fn()
    const first = await openJournalSession(repository, {
      stateHome,
      pid: 123,
      isProcessAlive: () => false,
    })
    const second = await openJournalSession(repository, {
      stateHome,
      pid: 456,
      isProcessAlive: () => false,
      logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
    })

    expect(warn).toHaveBeenCalledOnce()
    await first.release()
    await second.release()
  })

  it('reports a corrupt journal without discarding it', async () => {
    const repository = await temporaryRoot()
    const stateHome = await temporaryRoot()
    const session = await openJournalSession(repository, { stateHome })
    await writeFile(session.paths.journal, '{truncated', 'utf8')

    await expect(session.read()).rejects.toBeInstanceOf(InvalidJournal)
    expect(await readFile(session.paths.journal, 'utf8')).toBe('{truncated')
    await session.release()
  })
})
