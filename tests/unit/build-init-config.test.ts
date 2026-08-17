import { describe, expect, it } from 'vitest'
import { buildInitPlan } from '../../src/config/build-init-config.js'
import { releaserConfigSchema } from '../../src/config/schema.js'
import { matchVersion } from '../../src/versioning/version-pattern.js'

describe('buildInitPlan', () => {
  it('needs no config when npm is detected', () => {
    const plan = buildInitPlan({ kind: 'npm' })
    expect(plan.kind).toBe('no-config-needed')
  })

  it('produces a schema-valid config with npm publication disabled for every non-npm source', () => {
    const sources = [
      { kind: 'cargo', file: 'Cargo.toml' },
      { kind: 'python', file: 'pyproject.toml', section: 'project' },
      { kind: 'python', file: 'pyproject.toml', section: 'tool.poetry' },
      { kind: 'cmake', file: 'CMakeLists.txt' },
      { kind: 'pkgbuild', file: 'packaging/pkgbuild/PKGBUILD' },
      { kind: 'existing-version-file', file: 'VERSION' },
      { kind: 'go-module' },
      { kind: 'none' },
    ] as const

    for (const source of sources) {
      const plan = buildInitPlan(source)
      expect(plan.kind).toBe('generate')
      if (plan.kind !== 'generate') {
        continue
      }
      const parsed = releaserConfigSchema.parse(plan.config)
      expect(parsed.npm.publish).toBe(false)
      expect(parsed.versionPattern).not.toBeNull()
    }
  })

  it('matches the version out of a representative Cargo.toml exactly once', () => {
    const plan = buildInitPlan({ kind: 'cargo', file: 'Cargo.toml' })
    if (plan.kind !== 'generate') {
      throw new Error('expected a generated plan')
    }
    const parsed = releaserConfigSchema.parse(plan.config)
    const source = [
      '[package]',
      'name = "foo"',
      'version = "0.4.2"',
      'edition = "2021"',
      '',
      '[dependencies]',
      'serde = { version = "1.0", features = ["derive"] }',
      '',
    ].join('\n')

    expect(parsed.versionPattern).not.toBeNull()
    const match = matchVersion(source, parsed.versionPattern!)
    expect(match).toMatchObject({ kind: 'found', value: '0.4.2' })
  })

  it('matches the version out of a representative CMakeLists.txt exactly once', () => {
    const plan = buildInitPlan({ kind: 'cmake', file: 'CMakeLists.txt' })
    if (plan.kind !== 'generate') {
      throw new Error('expected a generated plan')
    }
    const parsed = releaserConfigSchema.parse(plan.config)
    const source =
      'cmake_minimum_required(VERSION 3.21)\n\nproject(Foo VERSION 1.2.3 LANGUAGES CXX)\n'

    const match = matchVersion(source, parsed.versionPattern!)
    expect(match).toMatchObject({ kind: 'found', value: '1.2.3' })
  })

  it('creates a VERSION file for go modules and unrecognized projects', () => {
    for (const source of [{ kind: 'go-module' }, { kind: 'none' }] as const) {
      const plan = buildInitPlan(source)
      if (plan.kind !== 'generate') {
        throw new Error('expected a generated plan')
      }
      expect(plan.versionFile).toEqual({ path: 'VERSION', contents: '0.1.0\n' })
    }
  })
})
