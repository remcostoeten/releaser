import { afterEach, describe, expect, it } from 'vitest'
import { planRelease, scanRelease } from '../../src/cli/release-service.js'
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
