import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { initRelease } from '../../src/cli/init-service.js'

const directories: string[] = []

async function createTempDir(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'releaser-init-service-'))
  directories.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('initRelease', () => {
  it('reports no-config-needed for an npm project without writing anything', async () => {
    const root = await createTempDir()
    await writeFile(join(root, 'package.json'), '{"name":"x"}')

    const result = await initRelease({ cwd: root })

    expect(result).toEqual({
      kind: 'no-config-needed',
      root,
      reason: expect.stringContaining('package.json found'),
    })
  })

  it('generates a config and version file for an unrecognized project', async () => {
    const root = await createTempDir()

    const result = await initRelease({ cwd: root })

    expect(result.kind).toBe('initialized')
    if (result.kind !== 'initialized') {
      throw new Error('expected initialized result')
    }
    expect(result.versionFilePath).toBe('VERSION')

    const config = JSON.parse(await readFile(result.configPath, 'utf8'))
    expect(config.versionFile).toBe('VERSION')
    expect(config.npm.publish).toBe(false)

    const version = await readFile(join(root, 'VERSION'), 'utf8')
    expect(version).toBe('0.1.0\n')
  })

  it('writes nothing during a dry run', async () => {
    const root = await createTempDir()

    const result = await initRelease({ cwd: root, dryRun: true })

    expect(result.kind).toBe('initialized')
    await expect(readFile(join(root, 'releaser.config.json'), 'utf8')).rejects.toThrow(/ENOENT/u)
  })

  it('refuses to overwrite an existing config without --force', async () => {
    const root = await createTempDir()
    await writeFile(join(root, 'releaser.config.json'), '{}')

    const result = await initRelease({ cwd: root })

    expect(result.kind).toBe('already-configured')
    expect(await readFile(join(root, 'releaser.config.json'), 'utf8')).toBe('{}')
  })

  it('overwrites an existing config when --force is passed', async () => {
    const root = await createTempDir()
    await writeFile(join(root, 'releaser.config.json'), '{}')

    const result = await initRelease({ cwd: root, force: true })

    expect(result.kind).toBe('initialized')
    const config = JSON.parse(await readFile(join(root, 'releaser.config.json'), 'utf8'))
    expect(config.versionFile).toBe('VERSION')
  })
})
