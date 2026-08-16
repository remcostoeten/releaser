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
})
