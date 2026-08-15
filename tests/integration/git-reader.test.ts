import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitReader } from '../../src/git/git-reader.js'
import { createCommandRunner } from '../../src/shared/command-runner.js'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'

const repositories: TempRepository[] = []

async function newRepository(options: { withOrigin?: boolean } = {}): Promise<TempRepository> {
  const repository = await createTempRepository(options)
  repositories.push(repository)
  return repository
}

function readerFor(repository: TempRepository, cwd: string = repository.root) {
  return createGitReader(createCommandRunner(), { cwd, remote: 'origin' })
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()))
})

describe('git reader — repository state', () => {
  it('reports a clean repository with no remote', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'package.json': '{"version":"1.0.0"}\n' })

    const lookup = await readerFor(repository).readState()

    expect(lookup.kind).toBe('found')
    if (lookup.kind !== 'found') {
      return
    }
    expect(lookup.state.head).toMatchObject({ kind: 'branch', branch: 'main' })
    expect(lookup.state.workingTree).toEqual({ kind: 'clean' })
    expect(lookup.state.remotes).toEqual([])
    expect(lookup.state.defaultBranch).toBeNull()
  })

  it('reports a directory outside any repository', async () => {
    const reader = createGitReader(createCommandRunner(), { cwd: '/', remote: 'origin' })

    const lookup = await reader.readState()

    expect(lookup.kind).toBe('not-a-repository')
  })

  it('reports a repository without commits', async () => {
    const repository = await newRepository()

    const lookup = await readerFor(repository).readState()

    expect(lookup.kind).toBe('no-commits')
  })

  it('lists modified and untracked files as dirty entries', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.write('a.txt', 'two\n')
    await repository.write('b.txt', 'new\n')

    const lookup = await readerFor(repository).readState()

    expect(lookup.kind).toBe('found')
    if (lookup.kind !== 'found') {
      return
    }
    expect(lookup.state.workingTree.kind).toBe('dirty')
    if (lookup.state.workingTree.kind !== 'dirty') {
      return
    }
    expect(lookup.state.workingTree.entries).toContain(' M a.txt')
    expect(lookup.state.workingTree.entries).toContain('?? b.txt')
  })

  it('changes the status digest when tracked content changes but HEAD does not', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    const reader = readerFor(repository)

    const before = await reader.readFingerprint('1.0.0')
    await repository.write('a.txt', 'two\n')
    const after = await reader.readFingerprint('1.0.0')

    expect(after.headSha).toBe(before.headSha)
    expect(after.statusDigest).not.toBe(before.statusDigest)
    expect(after.upstreamSha).toBeNull()
  })

  it('reports a detached HEAD', async () => {
    const repository = await newRepository()
    const first = await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.commit('second', { 'a.txt': 'two\n' })
    await repository.git(['checkout', '--detach', first])

    const lookup = await readerFor(repository).readState()

    expect(lookup.kind).toBe('found')
    if (lookup.kind !== 'found') {
      return
    }
    expect(lookup.state.head).toEqual({ kind: 'detached', sha: first })
  })

  it('resolves the repository root from a subdirectory', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'nested/a.txt': 'one\n' })

    const location = await readerFor(repository, join(repository.root, 'nested')).locate()

    expect(location).toEqual({
      kind: 'found',
      root: await repository.git(['rev-parse', '--show-toplevel']),
    })
  })
})

describe('git reader — upstream tracking', () => {
  it('reports no upstream before the branch is pushed', async () => {
    const repository = await newRepository({ withOrigin: true })
    await repository.commit('initial', { 'a.txt': 'one\n' })

    const lookup = await readerFor(repository).readState()

    expect(lookup.kind).toBe('found')
    if (lookup.kind !== 'found' || lookup.state.head.kind !== 'branch') {
      return
    }
    expect(lookup.state.head.upstream).toEqual({ kind: 'none' })
    expect(lookup.state.remotes).toEqual(['origin'])
  })

  it('reports ahead, behind and diverged counts against upstream', async () => {
    const repository = await newRepository({ withOrigin: true })
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['push', '--set-upstream', 'origin', 'main'])

    const synced = await readerFor(repository).readState()
    expect(
      synced.kind === 'found' && synced.state.head.kind === 'branch'
        ? synced.state.head.upstream
        : null,
    ).toMatchObject({ kind: 'tracked', ahead: 0, behind: 0, remote: 'origin' })

    await repository.commit('local work', { 'a.txt': 'two\n' })
    const ahead = await readerFor(repository).readState()
    expect(
      ahead.kind === 'found' && ahead.state.head.kind === 'branch'
        ? ahead.state.head.upstream
        : null,
    ).toMatchObject({ ahead: 1, behind: 0 })
  })

  it('reports a branch behind and then diverged from upstream', async () => {
    const repository = await newRepository({ withOrigin: true })
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['push', '--set-upstream', 'origin', 'main'])
    await repository.commit('remote work', { 'a.txt': 'remote\n' })
    await repository.git(['push', 'origin', 'main'])
    await repository.git(['reset', '--hard', 'HEAD~1'])
    await repository.git(['fetch', 'origin'])

    const behind = await readerFor(repository).readState()
    expect(
      behind.kind === 'found' && behind.state.head.kind === 'branch'
        ? behind.state.head.upstream
        : null,
    ).toMatchObject({ ahead: 0, behind: 1 })

    await repository.commit('divergent work', { 'a.txt': 'local\n' })
    const diverged = await readerFor(repository).readState()
    expect(
      diverged.kind === 'found' && diverged.state.head.kind === 'branch'
        ? diverged.state.head.upstream
        : null,
    ).toMatchObject({ ahead: 1, behind: 1 })
  })

  it('detects whether HEAD exists on the remote', async () => {
    const repository = await newRepository({ withOrigin: true })
    await repository.commit('initial', { 'a.txt': 'one\n' })
    const reader = readerFor(repository)

    expect(await reader.headExistsOnRemote('main', await repository.head())).toBe(false)

    await repository.git(['push', 'origin', 'main'])

    expect(await reader.headExistsOnRemote('main', await repository.head())).toBe(true)
  })

  it('reports the remote default branch when origin/HEAD is set', async () => {
    const repository = await newRepository({ withOrigin: true })
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['push', '--set-upstream', 'origin', 'main'])
    await repository.git(['remote', 'set-head', 'origin', 'main'])

    const lookup = await readerFor(repository).readState()

    expect(lookup.kind === 'found' ? lookup.state.defaultBranch : null).toBe('main')
  })

  it('reports no remote once origin is removed', async () => {
    const repository = await newRepository({ withOrigin: true })
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['remote', 'remove', 'origin'])

    const lookup = await readerFor(repository).readState()

    expect(lookup.kind === 'found' ? lookup.state.remotes : null).toEqual([])
    expect(await readerFor(repository).readRemoteRepository()).toBeNull()
  })

  it('parses the origin URL into a repository reference', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['remote', 'add', 'origin', 'git@github.com:remcostoeten/releaser.git'])

    expect(await readerFor(repository).readRemoteRepository()).toEqual({
      host: 'github.com',
      owner: 'remcostoeten',
      repo: 'releaser',
    })
  })
})

describe('git reader — tags and history', () => {
  it('finds the highest prefixed release tag that is an ancestor of HEAD', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['tag', '--annotate', 'v1.0.0', '--message', 'v1.0.0'])
    await repository.commit('feature', { 'a.txt': 'two\n' })
    await repository.git(['tag', '--annotate', 'v1.1.0', '--message', 'v1.1.0'])
    await repository.git(['tag', 'nightly'])
    await repository.commit('more', { 'a.txt': 'three\n' })

    const reader = readerFor(repository)
    const previous = await reader.findPreviousRelease('v')

    expect(previous).toMatchObject({ ref: 'v1.1.0', version: '1.1.0' })
    expect((await reader.listLocalTags()).map((tag) => tag.name).toSorted()).toEqual([
      'nightly',
      'v1.0.0',
      'v1.1.0',
    ])
  })

  it('ignores a higher tag that is not an ancestor of HEAD', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['tag', '--annotate', 'v1.0.0', '--message', 'v1.0.0'])
    await repository.git(['checkout', '-b', 'other'])
    await repository.commit('other work', { 'a.txt': 'other\n' })
    await repository.git(['tag', '--annotate', 'v2.0.0', '--message', 'v2.0.0'])
    await repository.git(['checkout', 'main'])
    await repository.commit('maintenance', { 'a.txt': 'fix\n' })

    expect(await readerFor(repository).findPreviousRelease('v')).toMatchObject({ ref: 'v1.0.0' })
  })

  it('returns null when no tag carries the configured prefix', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['tag', 'nightly'])

    expect(await readerFor(repository).findPreviousRelease('v')).toBeNull()
  })

  it('resolves annotated tags to the commit they point at, locally and on the remote', async () => {
    const repository = await newRepository({ withOrigin: true })
    const sha = await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['tag', '--annotate', 'v1.0.0', '--message', 'v1.0.0'])
    const reader = readerFor(repository)

    expect(await reader.resolveLocalTag('v1.0.0')).toBe(sha)
    expect(await reader.localTagExists('v1.0.0')).toBe(true)
    expect(await reader.remoteTagExists('v1.0.0')).toBe(false)

    await repository.git(['push', 'origin', 'refs/tags/v1.0.0'])

    expect(await reader.resolveRemoteTag('v1.0.0')).toBe(sha)
    expect((await reader.listRemoteTags()).map((tag) => tag.name)).toEqual(['v1.0.0'])
  })

  it('preserves commit messages containing newlines and quotes', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    const message = 'feat: add "quoted" flag\n\nBody line one.\nBody line two.\n'
    await repository.commit(message, { 'a.txt': 'two\n' })

    const commits = await readerFor(repository).readCommits({ from: null, to: 'HEAD' })

    expect(commits).toHaveLength(2)
    expect(commits[0]?.subject).toBe('feat: add "quoted" flag')
    expect(commits[0]?.body).toBe('Body line one.\nBody line two.')
    expect(commits[0]?.author).toBe('Releaser Test')
    expect(commits[0]?.parents).toHaveLength(1)
  })

  it('reads commits and changed files in a tag-to-HEAD range', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['tag', '--annotate', 'v1.0.0', '--message', 'v1.0.0'])
    await repository.commit('feat: b', { 'b.txt': 'b\n' })
    await repository.commit('fix: c', { 'c.txt': 'c\n' })
    const reader = readerFor(repository)

    const commits = await reader.readCommits({ from: 'v1.0.0', to: 'HEAD' })
    const files = await reader.readChangedFiles({ from: 'v1.0.0', to: 'HEAD' })

    expect(commits.map((commit) => commit.subject)).toEqual(['fix: c', 'feat: b'])
    expect(files).toEqual(['b.txt', 'c.txt'])
  })

  it('lists every tracked file when there is no previous release', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n', 'nested/b.txt': 'b\n' })

    const files = await readerFor(repository).readChangedFiles({ from: null, to: 'HEAD' })

    expect(files).toEqual(['a.txt', 'nested/b.txt'])
  })

  it('reports a merge commit with both parents', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['checkout', '-b', 'feature'])
    await repository.commit('feat: side', { 'side.txt': 'side\n' })
    await repository.git(['checkout', 'main'])
    await repository.commit('main work', { 'main.txt': 'main\n' })
    await repository.git(['merge', '--no-ff', 'feature', '--message', 'Merge branch feature'])

    const commits = await readerFor(repository).readCommits({ from: null, to: 'HEAD' })

    expect(commits[0]?.subject).toBe('Merge branch feature')
    expect(commits[0]?.parents).toHaveLength(2)
  })

  it('does not resolve a tag that was deleted from the working repository', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'a.txt': 'one\n' })
    await repository.git(['tag', '--annotate', 'v1.0.0', '--message', 'v1.0.0'])
    await repository.git(['tag', '--delete', 'v1.0.0'])
    await rm(join(repository.root, 'a.txt'))

    expect(await readerFor(repository).resolveLocalTag('v1.0.0')).toBeNull()
  })
})
