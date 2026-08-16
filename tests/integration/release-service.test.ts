import { afterEach, describe, expect, it } from 'vitest'
import { planRelease, scanRelease } from '../../src/cli/release-service.js'
import { readHumanReleaseStatus } from '../../src/cli/status-service.js'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'

const repositories: TempRepository[] = []

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()))
})

describe('release service repository resolution', () => {
  it('maps a missing --cwd path to a typed usage error', async () => {
    await expect(
      planRelease({ cwd: '/path/that/does/not/exist', bump: 'patch' }),
    ).rejects.toMatchObject({
      kind: 'UsageError',
      message: 'Working directory does not exist: /path/that/does/not/exist',
      remediation: 'Pass --cwd with an existing directory path.',
    })
  })

  it('uses repository-root configuration when --cwd points at a nested directory', async () => {
    const repository = await createTempRepository()
    repositories.push(repository)
    await repository.commit('initial', {
      'package.json': '{"name":"desktop-app","private":true}\n',
      'app/tauri.conf.json': '{"version":"1.2.3"}\n',
      'src/version.txt': 'current=1.2.3\n',
      'releaser.config.json': JSON.stringify({
        versionFile: 'app/tauri.conf.json',
        npm: { publish: false },
      }),
    })

    const result = await scanRelease({ cwd: `${repository.root}/app` })

    expect(result.version).toBe('1.2.3')
    expect(result.occurrences.map((occurrence) => occurrence.file)).toEqual([
      'app/tauri.conf.json',
      'src/version.txt',
    ])
  })
})

describe('human status service', () => {
  it('reads human status without writing or contacting disabled services', async () => {
    const repository = await createTempRepository({ withOrigin: true })
    repositories.push(repository)
    await repository.commit('initial', {
      'package.json': '{"name":"desktop-app","version":"1.2.3","private":true}\n',
      'releaser.config.json': JSON.stringify({
        npm: { publish: false },
        github: { release: false },
      }),
    })
    await repository.git(['tag', 'v1.2.3'])

    const result = await readHumanReleaseStatus({ cwd: repository.root })

    expect(result.repository.kind).toBe('found')
    expect(result.manifest.kind).toBe('found')
    expect(result.registry).toEqual({ kind: 'skipped', reason: 'npm publication is disabled' })
    expect(result.tag).toEqual({
      kind: 'available',
      name: 'v1.2.3',
      local: true,
      remote: false,
    })
    expect(result.github).toEqual({
      kind: 'skipped',
      reason: 'GitHub Release creation is disabled',
    })
    expect(await repository.git(['status', '--porcelain=v1'])).toBe('')
  })
})
