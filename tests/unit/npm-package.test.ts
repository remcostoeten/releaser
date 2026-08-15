import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { InvalidPackageManifest, PackagePrivate } from '../../src/domain/errors.js'
import { createPackageReader } from '../../src/npm/package.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

async function packageDirectory(manifest: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'releaser-npm-package-'))
  temporaryDirectories.push(root)
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest), 'utf8')
  return root
}

describe('package discovery', () => {
  it('reads and validates publication metadata', async () => {
    const root = await packageDirectory({
      name: '@scope/example',
      version: '1.2.3',
      files: ['dist'],
      publishConfig: { access: 'public', tag: 'next', provenance: true },
    })

    const manifest = await createPackageReader().read(root)

    expect(manifest).toMatchObject({
      name: '@scope/example',
      version: '1.2.3',
      private: false,
      files: ['dist'],
      publishConfig: { access: 'public', tag: 'next', provenance: true },
    })
    expect(manifest.root).toBe(root)
    expect(manifest.path).toBe(join(root, 'package.json'))
  })

  it('rejects private packages', async () => {
    const root = await packageDirectory({ name: 'example', version: '1.0.0', private: true })

    await expect(createPackageReader().read(root)).rejects.toBeInstanceOf(PackagePrivate)
  })

  it.each([
    [{ version: '1.0.0' }],
    [{ name: 'example', version: 'not-semver' }],
    [{ name: 'UPPERCASE', version: '1.0.0' }],
  ])('rejects malformed manifests', async (manifest) => {
    const root = await packageDirectory(manifest)

    await expect(createPackageReader().read(root)).rejects.toBeInstanceOf(InvalidPackageManifest)
  })
})
