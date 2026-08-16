import { afterEach, describe, expect, it } from 'vitest'
import { scanRelease } from '../../src/cli/release-service.js'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'

const repositories: TempRepository[] = []

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()))
})

describe('release service repository resolution', () => {
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
