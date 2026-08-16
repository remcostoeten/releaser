import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createVersionScanner } from '../../src/versioning/scanner.js'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'
import { version } from '../helpers/semantic.js'

let repository: TempRepository | null = null

afterEach(async () => {
  await repository?.cleanup()
  repository = null
})

describe('version scanner', () => {
  it('reports exact occurrences in sorted Git-tracked text files', async () => {
    repository = await createTempRepository()
    await repository.commit('initial', {
      'z.txt': 'first\nversion 1.2.3 here\n',
      'a.txt': '1.2.3 then 1.2.3\n',
      'unrelated.txt': '1.2.30\n',
    })

    const occurrences = await createVersionScanner(repository.runner, repository.root).scan(
      version('1.2.3'),
    )

    expect(occurrences).toEqual([
      { file: 'a.txt', line: 1, column: 1 },
      { file: 'a.txt', line: 1, column: 12 },
      { file: 'unrelated.txt', line: 1, column: 1 },
      { file: 'z.txt', line: 2, column: 9 },
    ])
  })
})

describe('version scanner exclusions', () => {
  it('skips untracked, binary, built-output, and releaser-ignored files', async () => {
    repository = await createTempRepository()
    await repository.write('.releaserignore', 'ignored.txt\nnested/**\n')
    await repository.write('kept.txt', '1.2.3\n')
    await repository.write('ignored.txt', '1.2.3\n')
    await repository.write('nested/version.txt', '1.2.3\n')
    await repository.write('dist/generated.txt', '1.2.3\n')
    await repository.write('node_modules/tracked.txt', '1.2.3\n')
    await writeFile(join(repository.root, 'binary.bin'), Buffer.from([0, 49, 46, 50, 46, 51]))
    await repository.git([
      'add',
      '--force',
      '.releaserignore',
      'kept.txt',
      'ignored.txt',
      'nested/version.txt',
      'dist/generated.txt',
      'node_modules/tracked.txt',
      'binary.bin',
    ])
    await repository.git(['commit', '--message', 'initial'])
    await repository.write('untracked.txt', '1.2.3\n')

    const occurrences = await createVersionScanner(repository.runner, repository.root).scan(
      version('1.2.3'),
    )

    expect(occurrences).toEqual([{ file: 'kept.txt', line: 1, column: 1 }])
  })

  it('skips tracked symlinks, including dangling ones and links to directories', async () => {
    repository = await createTempRepository()
    await repository.write('kept.txt', '1.2.3\n')
    await mkdir(join(repository.root, 'linked-directory'))
    await repository.write('linked-directory/inside.txt', '1.2.3\n')
    await symlink('linked-directory', join(repository.root, 'directory-link'))
    await symlink('missing-target.txt', join(repository.root, 'dangling-link'))
    await repository.git([
      'add',
      'kept.txt',
      'linked-directory/inside.txt',
      'directory-link',
      'dangling-link',
    ])
    await repository.git(['commit', '--message', 'initial'])

    const occurrences = await createVersionScanner(repository.runner, repository.root).scan(
      version('1.2.3'),
    )

    expect(occurrences).toEqual([
      { file: 'kept.txt', line: 1, column: 1 },
      { file: 'linked-directory/inside.txt', line: 1, column: 1 },
    ])
  })
})
