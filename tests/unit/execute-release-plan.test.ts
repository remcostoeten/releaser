import { describe, expect, it, vi } from 'vitest'
import type {
  ExecutionDependencies,
  ExecutionStage,
} from '../../src/application/execution-ports.js'
import { executeReleasePlan } from '../../src/application/execute-release-plan.js'
import { OtpRequired, StalePlan } from '../../src/domain/errors.js'
import type { ReleasePlan } from '../../src/domain/release-plan.js'
import type { StageName } from '../../src/domain/stages.js'
import type { JournalSession } from '../../src/journal/storage.js'
import type { ReleaseJournal } from '../../src/journal/types.js'
import { examplePlan } from '../helpers/plan-fixture.js'
import { sha } from '../helpers/semantic.js'

type Harness = {
  deps: ExecutionDependencies
  effects: Set<StageName>
  writes: StageName[]
  journalOpens: ReturnType<typeof vi.fn>
}

function createMemorySession(): JournalSession {
  let journal: ReleaseJournal | null = null
  return {
    paths: {
      id: 'test',
      directory: '/state',
      journal: '/state/test.json',
      lock: '/state/test.lock',
    },
    read: () => Promise.resolve(journal),
    initialize(nextPlan) {
      journal = { schemaVersion: 1, plan: nextPlan, entries: [], completedAt: null }
      return Promise.resolve(journal)
    },
    append(entry) {
      if (journal === null) {
        throw new Error('journal not initialized')
      }
      journal = {
        ...journal,
        entries: [
          ...journal.entries,
          { ...entry, sequence: journal.entries.length, recordedAt: new Date().toISOString() },
        ],
      }
      return Promise.resolve(journal)
    },
    complete() {
      if (journal === null) {
        throw new Error('journal not initialized')
      }
      journal = { ...journal, completedAt: new Date().toISOString() }
      return Promise.resolve(journal)
    },
    release: () => Promise.resolve(),
  }
}

function createStage(
  stage: StageName,
  effects: Set<StageName>,
  writes: StageName[],
): ExecutionStage {
  return {
    check: () =>
      Promise.resolve(
        effects.has(stage)
          ? {
              kind: 'complete' as const,
              ...(stage === 'commit' ? { releaseCommitSha: sha('b'.repeat(40)) } : {}),
            }
          : { kind: 'pending' as const },
      ),
    write: () => {
      writes.push(stage)
      effects.add(stage)
      return Promise.resolve(stage === 'commit' ? { releaseCommitSha: sha('b'.repeat(40)) } : {})
    },
  }
}

function createHarness(plan: ReleasePlan): Harness {
  const effects = new Set<StageName>()
  const writes: StageName[] = []
  const session = createMemorySession()
  const journalOpens = vi.fn(() => Promise.resolve(session))
  const stages = {
    'mutate-files': createStage('mutate-files', effects, writes),
    commit: createStage('commit', effects, writes),
    tag: createStage('tag', effects, writes),
    'push-branch': createStage('push-branch', effects, writes),
    'push-tag': createStage('push-tag', effects, writes),
    'github-release': createStage('github-release', effects, writes),
  }
  return {
    effects,
    writes,
    journalOpens,
    deps: {
      readFingerprint: () => Promise.resolve(plan.fingerprint),
      stages,
      publish: {
        ...createStage('npm-publish', effects, writes),
        writeWithOtp: () => Promise.resolve({}),
      },
      dryRun: {
        previewFileMutations: () => Promise.resolve('diff'),
        inspectPackage: () => Promise.resolve('pack'),
        publishDryRun: () => Promise.resolve('publish'),
      },
      journal: { open: journalOpens },
    },
  }
}

describe('executeReleasePlan', () => {
  it('executes the seven stages in normative order', async () => {
    const plan = examplePlan()
    const harness = createHarness(plan)

    const result = await executeReleasePlan(harness.deps, plan)

    expect(result.kind).toBe('completed')
    expect(harness.writes).toEqual([
      'mutate-files',
      'commit',
      'tag',
      'push-branch',
      'push-tag',
      'npm-publish',
      'github-release',
    ])
  })

  it('performs no write-boundary or journal calls during dry run', async () => {
    const plan = examplePlan()
    const harness = createHarness(plan)

    const result = await executeReleasePlan(harness.deps, plan, { dryRun: true })

    expect(result.kind).toBe('dry-run')
    expect(harness.writes).toEqual([])
    expect(harness.journalOpens).not.toHaveBeenCalled()
  })

  it('skips npm dry-run commands when publication is disabled', async () => {
    const source = examplePlan()
    const plan = { ...source, npmPublish: { kind: 'skipped' as const, reason: 'disabled' } }
    const harness = createHarness(plan)
    const inspectPackage = vi.fn(() => Promise.resolve('pack'))
    const publishDryRun = vi.fn(() => Promise.resolve('publish'))
    harness.deps.dryRun.inspectPackage = inspectPackage
    harness.deps.dryRun.publishDryRun = publishDryRun

    const result = await executeReleasePlan(harness.deps, plan, { dryRun: true })

    expect(result).toMatchObject({
      kind: 'dry-run',
      packageInspection: { skipped: true, reason: 'disabled' },
      publishInspection: { skipped: true, reason: 'disabled' },
    })
    expect(inspectPackage).not.toHaveBeenCalled()
    expect(publishDryRun).not.toHaveBeenCalled()
  })

  it.each([
    'mutate-files',
    'commit',
    'tag',
    'push-branch',
    'push-tag',
    'npm-publish',
    'github-release',
  ] as const)('resumes without duplicating %s after an interruption', async (interruptedStage) => {
    const plan = examplePlan()
    const harness = createHarness(plan)
    const interruption = new Error(`interrupted after ${interruptedStage}`)

    await expect(
      executeReleasePlan(harness.deps, plan, {
        afterStage: (stage) =>
          stage === interruptedStage ? Promise.reject(interruption) : Promise.resolve(),
      }),
    ).rejects.toBe(interruption)
    await executeReleasePlan(harness.deps, plan)

    expect(harness.writes.filter((stage) => stage === interruptedStage)).toHaveLength(1)
    expect(harness.effects.size).toBe(7)
  })

  it('resolves an unknown npm outcome from the registry without republishing', async () => {
    const plan = examplePlan()
    const harness = createHarness(plan)
    let attempts = 0
    harness.deps.publish.write = () => {
      attempts += 1
      harness.effects.add('npm-publish')
      return Promise.reject(new Error('network timeout'))
    }

    const result = await executeReleasePlan(harness.deps, plan)

    expect(result.kind).toBe('completed')
    expect(attempts).toBe(1)
  })

  it('retries npm on resume only after the registry confirms the version is absent', async () => {
    const plan = examplePlan()
    const harness = createHarness(plan)
    let attempts = 0
    harness.deps.publish.write = () => {
      attempts += 1
      return Promise.reject(new Error('registry rejected publish'))
    }

    await expect(executeReleasePlan(harness.deps, plan)).rejects.toThrow(
      'registry rejected publish',
    )
    harness.deps.publish.write = () => {
      attempts += 1
      harness.effects.add('npm-publish')
      return Promise.resolve({})
    }
    await executeReleasePlan(harness.deps, plan)

    expect(attempts).toBe(2)
  })

  it('reports OTP requirements without retrying in non-interactive mode', async () => {
    const plan = examplePlan()
    const harness = createHarness(plan)
    const publish = vi.fn(() => Promise.reject(new OtpRequired()))
    harness.deps.publish.write = publish

    await expect(executeReleasePlan(harness.deps, plan)).rejects.toMatchObject({
      kind: 'OtpRequired',
      details: { retryPossible: false },
    })
    expect(publish).toHaveBeenCalledOnce()
  })

  it.each(['headSha', 'statusDigest', 'manifestVersion', 'upstreamSha'] as const)(
    'rejects a stale %s before opening the journal',
    async (field) => {
      const plan = examplePlan()
      const harness = createHarness(plan)
      harness.deps.readFingerprint = () =>
        Promise.resolve({
          ...plan.fingerprint,
          [field]:
            field === 'upstreamSha'
              ? null
              : field === 'manifestVersion'
                ? '9.0.0'
                : 'f'.repeat(field === 'statusDigest' ? 64 : 40),
        } as typeof plan.fingerprint)

      await expect(executeReleasePlan(harness.deps, plan, { dryRun: true })).rejects.toBeInstanceOf(
        StalePlan,
      )
      expect(harness.journalOpens).not.toHaveBeenCalled()
    },
  )
})
