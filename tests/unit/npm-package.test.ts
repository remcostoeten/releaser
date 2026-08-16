import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { PackagePrivate } from '../../src/domain/errors.js'
import { createPackageReader, requirePublishablePackage } from '../../src/npm/package.js'

const directories: string[] = []

async function createPackage(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'releaser-npm-package-'))
  directories.push(root)
  await writeFile(join(root, 'package.json'), source)
  return root
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('npm package discovery', () => {
  it('reads the publishable manifest fields and package root', async () => {
    const root = await createPackage(
      JSON.stringify({
        name: '@example/tool',
        version: '1.2.3',
        files: ['dist', 'README.md'],
        publishConfig: {
          access: 'public',
          registry: 'https://registry.npmjs.org/',
          tag: 'next',
          provenance: true,
        },
      }),
    )

    const lookup = await createPackageReader(root).read()

    expect(lookup).toEqual({
      kind: 'found',
      manifest: {
        name: '@example/tool',
        version: '1.2.3',
        private: false,
        files: ['dist', 'README.md'],
        publishConfig: {
          access: 'public',
          registry: 'https://registry.npmjs.org/',
          tag: 'next',
          provenance: true,
        },
        root,
      },
    })
  })

  it('reads a repository release version from a configured JSON file', async () => {
    const root = await createPackage('{"name":"desktop-app","private":true}')
    await mkdir(join(root, 'app'))
    await writeFile(join(root, 'app', 'tauri.conf.json'), '{"version":"2.4.0"}')

    const lookup = await createPackageReader(root, 'app/tauri.conf.json').read()

    expect(lookup).toMatchObject({
      kind: 'found',
      manifest: { name: 'desktop-app', version: '2.4.0', private: true },
    })
  })
})

describe('npm package validation', () => {
  it('reports malformed JSON and invalid package values as unreadable', async () => {
    const malformedRoot = await createPackage('{')
    const invalidRoot = await createPackage('{"name":"Package With Spaces","version":"nope"}')

    expect(await createPackageReader(malformedRoot).read()).toMatchObject({ kind: 'unreadable' })
    expect(await createPackageReader(invalidRoot).read()).toMatchObject({ kind: 'unreadable' })
  })

  it('rejects a private package at the publication boundary', async () => {
    const root = await createPackage('{"name":"private-tool","version":"1.0.0","private":true}')
    const lookup = await createPackageReader(root).read()

    expect(lookup.kind).toBe('found')
    if (lookup.kind !== 'found') {
      return
    }
    expect(() => requirePublishablePackage(lookup.manifest)).toThrow(PackagePrivate)
  })
})
