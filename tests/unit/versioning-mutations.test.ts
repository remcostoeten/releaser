import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultConfig, type ReleaserConfig } from '../../src/config/schema.js'
import { applyEdits } from '../../src/domain/mutations.js'
import { repoPath, version } from '../helpers/semantic.js'
import {
  buildFileDiff,
  createMutationDiffs,
  createMutationPlanner,
  planPackageJsonVersion,
  planPackageLockVersion,
  planReplacement,
} from '../../src/versioning/index.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  )
})

async function temporaryProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'releaser-versioning-'))
  temporaryDirectories.push(root)
  await Promise.all(
    Object.entries(files).map(([path, source]) => writeFile(join(root, path), source, 'utf8')),
  )
  return root
}

function configWithReplacements(replacements: ReleaserConfig['replacements']): ReleaserConfig {
  return { ...defaultConfig, replacements }
}

describe('package version mutation planning', () => {
  it('preserves package.json formatting, key order, and trailing newline byte-for-byte', () => {
    const source =
      '{\n\t"scripts": { "test": "vitest" },\n\t"version": "1.2.3",\n\t"name": "example"\n}\n'
    const mutation = planPackageJsonVersion(source, version('1.2.3'), version('2.0.0'))

    expect(applyEdits(source, mutation.edits)).toBe(
      '{\n\t"scripts": { "test": "vitest" },\n\t"version": "2.0.0",\n\t"name": "example"\n}\n',
    )
    expect(Object.isFrozen(mutation)).toBe(true)
    expect(Object.isFrozen(mutation.edits[0])).toBe(true)
  })

  it('preserves the absence of a trailing newline', () => {
    const source = '{"version":"1.2.3","name":"example"}'
    const mutation = planPackageJsonVersion(source, version('1.2.3'), version('1.2.4'))

    expect(applyEdits(source, mutation.edits)).toBe('{"version":"1.2.4","name":"example"}')
  })

  it('updates both package-lock root version fields without reserializing', () => {
    const source =
      '{\n  "name": "example",\n  "version": "1.2.3",\n  "lockfileVersion": 3,\n  "packages": {\n    "": { "name": "example", "version": "1.2.3" },\n    "node_modules/x": { "version": "1.2.3" }\n  }\n}\n'
    const mutation = planPackageLockVersion(source, version('1.2.3'), version('1.3.0'))

    expect(mutation).not.toBeNull()
    const updated = applyEdits(source, mutation?.edits ?? [])
    expect(updated).toContain('"version": "1.3.0"')
    expect(updated.match(/"version": "1\.2\.3"/gu)).toHaveLength(1)
    expect(updated.endsWith('\n')).toBe(true)
  })
})

describe('configured replacements', () => {
  it.each([
    ['zero', 'no version here', 0],
    ['excess', 'v1.2.3 and v1.2.3', 2],
  ])('rejects a %s-match count mismatch', (_label, source, actualMatches) => {
    const result = planReplacement(
      source,
      { file: 'README.md', find: 'v1.2.3', replace: 'v{{version}}', expectedMatches: 1 },
      version('1.2.3'),
      version('2.4.6'),
    )

    expect(result).toEqual({
      kind: 'mismatch',
      pattern: { kind: 'literal', value: 'v1.2.3' },
      expectedMatches: 1,
      actualMatches,
    })
  })

  it('supports regexes and every replacement template value', () => {
    const source = 'release=1.2.3'
    const result = planReplacement(
      source,
      {
        file: 'release.txt',
        find: { pattern: 'release=\\d+\\.\\d+\\.\\d+', flags: 'g' },
        replace: '{{previousVersion}} -> {{version}} ({{major}}/{{minor}}/{{patch}})',
        expectedMatches: 1,
      },
      version('1.2.3'),
      version('2.4.6'),
    )

    expect(result.kind).toBe('planned')
    if (result.kind === 'planned') {
      expect(applyEdits(source, result.mutation.edits)).toBe('1.2.3 -> 2.4.6 (2/4/6)')
    }
  })
})

describe('mutation planner', () => {
  it('plans manifest, lockfile, and configured changes without writing files', async () => {
    const packageJson = '{\n  "name": "example",\n  "version": "1.2.3"\n}\n'
    const packageLock =
      '{\n  "name": "example",\n  "version": "1.2.3",\n  "packages": { "": { "version": "1.2.3" } }\n}\n'
    const root = await temporaryProject({
      'package.json': packageJson,
      'package-lock.json': packageLock,
      'README.md': 'Install v1.2.3\n',
    })
    const planner = createMutationPlanner(
      root,
      configWithReplacements([
        { file: 'README.md', find: 'v1.2.3', replace: 'v{{version}}', expectedMatches: 1 },
      ]),
    )

    const outcome = await planner.planMutations({
      previousVersion: version('1.2.3'),
      nextVersion: version('1.3.0'),
    })
    expect(outcome.kind).toBe('planned')
    if (outcome.kind !== 'planned') {
      return
    }
    expect(outcome.mutations.map((mutation) => mutation.kind)).toEqual([
      'manifest-version',
      'lockfile-version',
      'configured-replacement',
    ])
    const diffs = await createMutationDiffs(root, outcome.mutations)
    expect(diffs.map((diff) => diff.path)).toEqual([
      'README.md',
      'package-lock.json',
      'package.json',
    ])
    expect(diffs[0]?.unified).toContain('+Install v1.3.0')
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(packageJson)
    expect(await readFile(join(root, 'package-lock.json'), 'utf8')).toBe(packageLock)
  })

  it('uses a configured JSON version source instead of package.json', async () => {
    const root = await temporaryProject({
      'package.json': '{"name":"desktop-app","private":true}\n',
      'tauri.conf.json': '{\n  "productName": "Desktop",\n  "version": "1.2.3"\n}\n',
    })
    const config = {
      ...defaultConfig,
      versionFile: 'tauri.conf.json',
      npm: { ...defaultConfig.npm, publish: false },
    }

    const outcome = await createMutationPlanner(root, config).planMutations({
      previousVersion: version('1.2.3'),
      nextVersion: version('1.3.0'),
    })

    expect(outcome.kind).toBe('planned')
    if (outcome.kind !== 'planned') return
    expect(outcome.mutations).toHaveLength(1)
    expect(outcome.mutations[0]?.path).toBe('tauri.conf.json')
    const source = await readFile(join(root, 'tauri.conf.json'), 'utf8')
    expect(applyEdits(source, outcome.mutations[0]?.edits ?? [])).toContain('"version": "1.3.0"')
  })

  it('mutates a non-JSON version source through the configured pattern', async () => {
    const pkgbuild =
      '# Maintainer: Someone\npkgname=remcorder\npkgver=0.0.5\npkgrel=1\nsource=("remcorder-$pkgver.tar.gz")\n'
    const root = await temporaryProject({ PKGBUILD: pkgbuild })
    const config = {
      ...defaultConfig,
      versionFile: 'PKGBUILD',
      versionPattern: { pattern: '^pkgver=(.+)$', flags: 'm' },
      npm: { ...defaultConfig.npm, publish: false },
    }

    const outcome = await createMutationPlanner(root, config).planMutations({
      previousVersion: version('0.0.5'),
      nextVersion: version('0.0.6'),
    })

    expect(outcome.kind).toBe('planned')
    if (outcome.kind !== 'planned') return
    expect(outcome.mutations).toHaveLength(1)
    expect(applyEdits(pkgbuild, outcome.mutations[0]?.edits ?? [])).toBe(
      '# Maintainer: Someone\npkgname=remcorder\npkgver=0.0.6\npkgrel=1\nsource=("remcorder-$pkgver.tar.gz")\n',
    )
  })

  it('refuses a version pattern that matches more than once', async () => {
    const root = await temporaryProject({ PKGBUILD: 'pkgver=0.0.5\npkgver=0.0.5\n' })
    const config = {
      ...defaultConfig,
      versionFile: 'PKGBUILD',
      versionPattern: { pattern: '^pkgver=(.+)$', flags: 'm' },
      npm: { ...defaultConfig.npm, publish: false },
    }

    await expect(
      createMutationPlanner(root, config).planMutations({
        previousVersion: version('0.0.5'),
        nextVersion: version('0.0.6'),
      }),
    ).rejects.toThrow('must match exactly once')
  })
})

describe('optional package lock', () => {
  it('does not create a lockfile mutation when package-lock.json is absent', async () => {
    const root = await temporaryProject({
      'package.json': '{"name":"example","version":"1.2.3"}\n',
    })
    const outcome = await createMutationPlanner(root, defaultConfig).planMutations({
      previousVersion: version('1.2.3'),
      nextVersion: version('1.2.4'),
    })

    expect(
      outcome.kind === 'planned' && outcome.mutations.map((mutation) => mutation.kind),
    ).toEqual(['manifest-version'])
  })
})

describe('dry-run diffs', () => {
  it('renders a stable unified diff from immutable edits', () => {
    const diff = buildFileDiff(repoPath('version.txt'), '1.2.3\n', [
      { offset: 0, deletedText: '1.2.3', insertedText: '1.2.4' },
    ])

    expect(diff.unified).toBe(
      '--- a/version.txt\n+++ b/version.txt\n@@ -1,1 +1,1 @@\n-1.2.3\n+1.2.4',
    )
    expect(Object.isFrozen(diff)).toBe(true)
  })
})
