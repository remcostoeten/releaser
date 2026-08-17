import { describe, expect, it } from 'vitest'
import { defaultConfig, parseConfig } from '../../src/config/schema.js'

describe('releaser configuration', () => {
  it('uses package.json as the default version source', () => {
    expect(defaultConfig.versionFile).toBe('package.json')
  })

  it('accepts an external version source for repository releases', () => {
    const config = parseConfig(
      {
        versionFile: 'app/src-tauri/tauri.conf.json',
        npm: { publish: false },
      },
      'test config',
    )

    expect(config.versionFile).toBe('app/src-tauri/tauri.conf.json')
    expect(config.npm.publish).toBe(false)
  })

  it('rejects an external version source for npm publication', () => {
    expect(() =>
      parseConfig(
        {
          versionFile: 'app/src-tauri/tauri.conf.json',
          npm: { publish: true },
        },
        'test config',
      ),
    ).toThrow('Invalid configuration')
  })

  it('defaults to no version pattern, keeping the version source JSON', () => {
    expect(defaultConfig.versionPattern).toBeNull()
  })

  it('accepts a version pattern for a non-JSON version source', () => {
    const config = parseConfig(
      {
        versionFile: 'packaging/pkgbuild/PKGBUILD',
        versionPattern: { pattern: '^pkgver=(.+)$', flags: 'm' },
        npm: { publish: false },
      },
      'test config',
    )

    expect(config.versionPattern).toEqual({ pattern: '^pkgver=(.+)$', flags: 'm' })
  })

  it('rejects a version pattern when npm publication is enabled', () => {
    expect(() =>
      parseConfig(
        { versionPattern: { pattern: '^v=(.+)$' }, npm: { publish: true } },
        'test config',
      ),
    ).toThrow('Invalid configuration')
  })

  it('rejects a version pattern without a capture group', () => {
    expect(() =>
      parseConfig(
        { versionFile: 'VERSION', versionPattern: { pattern: '^\\d+' }, npm: { publish: false } },
        'test config',
      ),
    ).toThrow('Invalid configuration')
  })

  it('rejects a version pattern that is not a valid regular expression', () => {
    expect(() =>
      parseConfig(
        { versionFile: 'VERSION', versionPattern: { pattern: '([0-9]+' }, npm: { publish: false } },
        'test config',
      ),
    ).toThrow('Invalid configuration')
  })
})
