import { afterEach, describe, expect, it } from 'vitest'
import { TagExists } from '../../src/domain/errors.js'
import { createGitCommand, type GitCommand } from '../../src/git/git-command.js'
import { readRemoteBranchSha, resolveRemoteTag } from '../../src/git/git-refs.js'
import {
  createAnnotatedTag,
  createReleaseCommit,
  pushBranch,
  pushTag,
} from '../../src/git/git-writer.js'
import { createCommandRunner } from '../../src/shared/command-runner.js'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'

const repositories: TempRepository[] = []

async function newRepository(options: { withOrigin?: boolean } = {}): Promise<TempRepository> {
  const repository = await createTempRepository(options)
  repositories.push(repository)
  return repository
}

function commandFor(repository: TempRepository): GitCommand {
  return createGitCommand(createCommandRunner(), repository.root)
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()))
})

describe('release commit', () => {
  it('commits the planned paths', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'package.json': '{"version":"1.0.0"}\n' })
    await repository.write('package.json', '{"version":"1.1.0"}\n')
    const git = commandFor(repository)

    const outcome = await createReleaseCommit(git, {
      message: 'chore(release): 1.1.0',
      paths: ['package.json'],
    })

    expect(outcome.kind).toBe('created')
    expect(outcome.sha).toBe(await repository.head())
    expect(await repository.git(['log', '-1', '--format=%s'])).toBe('chore(release): 1.1.0')
    expect(await repository.git(['status', '--porcelain=v1'])).toBe('')
  })

  it('skips when the release commit is already HEAD', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'package.json': '{"version":"1.0.0"}\n' })
    await repository.write('package.json', '{"version":"1.1.0"}\n')
    const git = commandFor(repository)
    const action = { message: 'chore(release): 1.1.0', paths: ['package.json'] }

    const first = await createReleaseCommit(git, action)
    const second = await createReleaseCommit(git, action)

    expect(second).toEqual({ kind: 'skipped', sha: first.sha })
    expect(await repository.git(['rev-list', '--count', 'HEAD'])).toBe('2')
  })

  it('commits again when the tree changed after an identical message', async () => {
    const repository = await newRepository()
    await repository.commit('initial', { 'package.json': '{"version":"1.0.0"}\n' })
    await repository.write('package.json', '{"version":"1.1.0"}\n')
    const git = commandFor(repository)
    const action = { message: 'chore(release): 1.1.0', paths: ['package.json', 'extra.txt'] }

    await createReleaseCommit(git, { ...action, paths: ['package.json'] })
    await repository.write('extra.txt', 'added later\n')
    const second = await createReleaseCommit(git, action)

    expect(second.kind).toBe('created')
    expect(await repository.git(['rev-list', '--count', 'HEAD'])).toBe('3')
  })
})

describe('annotated tag', () => {
  it('creates the tag at the planned commit', async () => {
    const repository = await newRepository()
    const sha = await repository.commit('initial', { 'a.txt': 'one\n' })
    const git = commandFor(repository)

    const outcome = await createAnnotatedTag(git, { name: 'v1.0.0', message: '1.0.0' }, sha)

    expect(outcome).toEqual({ kind: 'created', sha })
    expect(await repository.git(['cat-file', '-t', 'v1.0.0'])).toBe('tag')
  })

  it('skips a tag that already points at the planned commit', async () => {
    const repository = await newRepository()
    const sha = await repository.commit('initial', { 'a.txt': 'one\n' })
    const git = commandFor(repository)
    const action = { name: 'v1.0.0', message: '1.0.0' }

    await createAnnotatedTag(git, action, sha)
    const second = await createAnnotatedTag(git, action, sha)

    expect(second).toEqual({ kind: 'skipped', sha })
  })

  it('fails instead of moving a tag that points elsewhere', async () => {
    const repository = await newRepository()
    const first = await repository.commit('initial', { 'a.txt': 'one\n' })
    const second = await repository.commit('second', { 'a.txt': 'two\n' })
    const git = commandFor(repository)
    await createAnnotatedTag(git, { name: 'v1.0.0', message: '1.0.0' }, first)

    await expect(
      createAnnotatedTag(git, { name: 'v1.0.0', message: '1.0.0' }, second),
    ).rejects.toBeInstanceOf(TagExists)
    expect(await repository.git(['rev-parse', 'refs/tags/v1.0.0^{commit}'])).toBe(first)
  })
})

describe('pushing', () => {
  it('pushes the branch and then skips when the remote already matches', async () => {
    const repository = await newRepository({ withOrigin: true })
    const sha = await repository.commit('initial', { 'a.txt': 'one\n' })
    const git = commandFor(repository)

    const first = await pushBranch(git, 'origin', 'main', sha)
    const second = await pushBranch(git, 'origin', 'main', sha)

    expect(first.kind).toBe('pushed')
    expect(second.kind).toBe('skipped')
    expect(await readRemoteBranchSha(git, 'origin', 'main')).toBe(sha)
  })

  it('fails a non-fast-forward branch push rather than forcing it', async () => {
    const repository = await newRepository({ withOrigin: true })
    await repository.commit('initial', { 'a.txt': 'one\n' })
    const sha = await repository.commit('second', { 'a.txt': 'two\n' })
    const git = commandFor(repository)
    await pushBranch(git, 'origin', 'main', sha)
    await repository.git(['reset', '--hard', 'HEAD~1'])
    await repository.commit('rewritten', { 'a.txt': 'rewritten\n' })

    await expect(pushBranch(git, 'origin', 'main', await repository.head())).rejects.toThrow()
    expect(await readRemoteBranchSha(git, 'origin', 'main')).toBe(sha)
  })

  it('pushes the tag and then skips when the remote tag already matches', async () => {
    const repository = await newRepository({ withOrigin: true })
    const sha = await repository.commit('initial', { 'a.txt': 'one\n' })
    const git = commandFor(repository)
    await createAnnotatedTag(git, { name: 'v1.0.0', message: '1.0.0' }, sha)

    const first = await pushTag(git, 'origin', 'v1.0.0', sha)
    const second = await pushTag(git, 'origin', 'v1.0.0', sha)

    expect(first.kind).toBe('pushed')
    expect(second.kind).toBe('skipped')
    expect(await resolveRemoteTag(git, 'origin', 'v1.0.0')).toBe(sha)
  })

  it('fails when the remote tag points at a different commit', async () => {
    const repository = await newRepository({ withOrigin: true })
    const first = await repository.commit('initial', { 'a.txt': 'one\n' })
    const git = commandFor(repository)
    await createAnnotatedTag(git, { name: 'v1.0.0', message: '1.0.0' }, first)
    await pushTag(git, 'origin', 'v1.0.0', first)
    const second = await repository.commit('second', { 'a.txt': 'two\n' })

    await expect(pushTag(git, 'origin', 'v1.0.0', second)).rejects.toBeInstanceOf(TagExists)
    expect(await resolveRemoteTag(git, 'origin', 'v1.0.0')).toBe(first)
  })
})
