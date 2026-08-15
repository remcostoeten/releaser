import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createReleasePlan,
  type CreateReleasePlanRequest,
} from '../../src/application/create-release-plan.js'
import { defaultConfig } from '../../src/config/schema.js'
import { VersionNotIncreasing } from '../../src/domain/errors.js'
import { serializeReleasePlan } from '../../src/domain/release-plan.js'
import { parseReleasePlan } from '../../src/journal/release-plan-schema.js'
import {
  cleanRepositoryState,
  createRecordingPorts,
  READ_ONLY_PORT_METHODS,
  type RecordingPortsOptions,
} from '../helpers/recording-ports.js'

const patchRequest: CreateReleasePlanRequest = {
  config: defaultConfig,
  selection: { kind: 'bump', bump: 'patch' },
  explicitDistTag: null,
}

function plan(
  options: RecordingPortsOptions = {},
  request: CreateReleasePlanRequest = patchRequest,
) {
  const { deps, recorder } = createRecordingPorts(options)
  return createReleasePlan(deps, request).then((result) => ({ result, recorder }))
}

const temporaryDirectories: string[] = []

function makeRepositoryDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), 'releaser-plan-'))
  temporaryDirectories.push(root)
  writeFileSync(join(root, 'package.json'), '{\n  "name": "example-package"\n}\n')
  writeFileSync(join(root, 'README.md'), '# example\n')
  return root
}

function snapshotDirectory(root: string): string {
  return readdirSync(root)
    .toSorted()
    .map((entry) => `${entry}:${readFileSync(join(root, entry), 'utf8')}`)
    .join('\n')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('createReleasePlan', () => {
  it('produces a plan bound to the fingerprint it was computed against', async () => {
    const { result } = await plan()

    expect(result.kind).toBe('planned')
    if (result.kind !== 'planned') return

    expect(result.plan.fingerprint).toEqual({
      headSha: 'a'.repeat(40),
      statusDigest: 'digest-clean',
      manifestVersion: '1.2.3',
      upstreamSha: 'a'.repeat(40),
    })
    expect(result.plan.version.nextVersion).toBe('1.2.4')
    expect(result.plan.tag).toEqual({ name: 'v1.2.4', message: '1.2.4' })
    expect(result.plan.commit.message).toBe('chore(release): 1.2.4')
    expect(result.plan.npmPublish).toEqual({
      kind: 'publish',
      packageName: 'example-package',
      version: '1.2.4',
      distTag: 'latest',
      access: 'public',
    })
    expect(result.plan.githubRelease.kind).toBe('create')
    expect(result.plan.boundary).toEqual({ kind: 'initial', headSha: 'a'.repeat(40) })
  })

  it('produces a plan that validates against the wire schema', async () => {
    const { result } = await plan()
    if (result.kind !== 'planned') throw new Error('expected a plan')

    expect(() => parseReleasePlan(JSON.parse(serializeReleasePlan(result.plan)))).not.toThrow()
  })

  it('uses the boundary of the previous release when one exists', async () => {
    const { result } = await plan({
      previousRelease: { ref: 'v1.2.3', sha: 'e'.repeat(40), version: '1.2.3' },
    })
    if (result.kind !== 'planned') throw new Error('expected a plan')

    expect(result.plan.boundary).toEqual({
      kind: 'since-release',
      previousRef: 'v1.2.3',
      previousSha: 'e'.repeat(40),
      previousVersion: '1.2.3',
      headSha: 'a'.repeat(40),
    })
  })

  it('plans for an unpublished package without a registry constraint', async () => {
    const { result } = await plan({ published: { kind: 'never-published' } })
    if (result.kind !== 'planned') throw new Error('expected a plan')

    expect(result.plan.version.nextVersion).toBe('1.2.4')
    expect(result.checks.find((check) => check.id === 'version-not-published')?.outcome).toBe(
      'passed',
    )
  })

  it('returns a blocking check for a dirty tree rather than throwing', async () => {
    const state = cleanRepositoryState()
    const { result } = await plan({
      state: { ...state, workingTree: { kind: 'dirty', entries: [' M src/index.ts'] } },
    })

    expect(result.kind).toBe('planned')
    const check = result.checks.find((entry) => entry.id === 'working-tree-clean')
    expect(check?.outcome).toBe('blocked')
    expect(check?.outcome === 'blocked' && check.overridable).toBe(true)
  })

  it('blocks, non-overridably, when the target tag already exists', async () => {
    const { result } = await plan({ remoteTagExists: true })

    const check = result.checks.find((entry) => entry.id === 'tag-available')
    expect(check?.outcome).toBe('blocked')
    expect(check?.outcome === 'blocked' && check.overridable).toBe(false)
  })

  it('skips the GitHub Release stage when no token is available', async () => {
    const { result } = await plan({ tokenStatus: { kind: 'absent' } })
    if (result.kind !== 'planned') throw new Error('expected a plan')

    expect(result.plan.githubRelease).toEqual({
      kind: 'skipped',
      reason: 'No GitHub token available',
    })
    const check = result.checks.find((entry) => entry.id === 'github-token-valid')
    expect(check?.outcome === 'blocked' && check.overridable).toBe(true)
  })

  it('does not plan when a replacement matches the wrong number of times', async () => {
    const { result } = await plan({
      mutations: {
        kind: 'replacement-mismatch',
        file: 'README.md',
        expectedMatches: 1,
        actualMatches: 0,
      },
    })

    expect(result.kind).toBe('not-planned')
    const check = result.checks.find((entry) => entry.id === 'replacements-match')
    expect(check?.outcome).toBe('blocked')
  })

  it('does not plan outside a Git repository', async () => {
    const { deps, recorder } = createRecordingPorts()
    const notARepository = {
      ...deps,
      repository: {
        ...deps.repository,
        readState: () =>
          Promise.resolve({ kind: 'not-a-repository' as const, path: '/tmp/elsewhere' }),
      },
    }

    const result = await createReleasePlan(notARepository, patchRequest)

    expect(result.kind).toBe('not-planned')
    expect(result.checks.at(-1)?.id).toBe('inside-git-repository')
    expect(recorder.calls).not.toContain('mutations.planMutations')
  })

  it('propagates a version that cannot increase', async () => {
    await expect(
      plan({}, { ...patchRequest, selection: { kind: 'custom', version: '1.0.0' } }),
    ).rejects.toThrow(VersionNotIncreasing)
  })

  it('warns when releasing from a branch other than the release branch', async () => {
    const state = cleanRepositoryState()
    const { result } = await plan({
      state: { ...state, defaultBranch: 'release' },
    })

    expect(result.checks.find((entry) => entry.id === 'on-release-branch')?.outcome).toBe('warned')
  })
})

describe('createReleasePlan write boundary', () => {
  it('calls read-only port methods only', async () => {
    const { recorder } = await plan()

    expect(recorder.calls.length).toBeGreaterThan(0)
    for (const call of recorder.calls) {
      expect(READ_ONLY_PORT_METHODS).toContain(call)
    }
  })

  it('leaves the repository directory byte-identical', async () => {
    const root = makeRepositoryDirectory()
    const before = snapshotDirectory(root)

    const { result } = await plan({ state: { ...cleanRepositoryState(root) } })

    expect(result.kind).toBe('planned')
    expect(snapshotDirectory(root)).toBe(before)
    expect(readdirSync(root).toSorted()).toEqual(['README.md', 'package.json'])
  })
})
