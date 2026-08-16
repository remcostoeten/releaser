import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MergeConflict } from '../../src/domain/errors.js'
import { planShip, prepareShip } from '../../src/cli/ship-service.js'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'

const repositories: TempRepository[] = []

async function repository(): Promise<TempRepository> {
  const repo = await createTempRepository({ withOrigin: true, branch: 'master' })
  repositories.push(repo)
  await repo.commit('initial', {
    'package.json': '{"name":"ship-test","version":"1.0.0"}\n',
    'src/value.txt': 'initial\n',
  })
  await repo.git(['push', '--set-upstream', 'origin', 'master'])
  return repo
}

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repo) => repo.cleanup()))
})

describe('ship preparation', () => {
  it('commits dirty feature work and merges locally without pushing master', async () => {
    const repo = await repository()
    const remoteBefore = await repo.git(['rev-parse', 'refs/remotes/origin/master'])
    await repo.git(['checkout', '-b', 'feature'])
    await repo.write('src/feature.ts', 'export const shipped = true\n')

    const plan = await planShip({
      cwd: repo.root,
      target: 'master',
      message: 'feat: add shipping',
    })
    expect(await repo.git(['branch', '--show-current'])).toBe('feature')
    expect(await repo.git(['status', '--porcelain'])).toContain('src/feature.ts')

    const result = await prepareShip(plan)

    expect(result.targetBranch).toBe('master')
    expect(await repo.git(['branch', '--show-current'])).toBe('master')
    expect(await repo.git(['status', '--porcelain'])).toBe('')
    expect(
      await repo.git(['log', '-1', '--format=%P']).then((parents) => parents.split(' ')),
    ).toHaveLength(2)
    expect(await repo.git(['ls-remote', 'origin', 'refs/heads/master'])).toContain(remoteBefore)
  })

  it('fast-forwards a target that is behind an unfetched remote commit', async () => {
    const repo = await repository()
    const clonePath = join(dirname(repo.originPath!), 'other-clone')
    await repo.git(['clone', repo.originPath!, clonePath], dirname(clonePath))
    await repo.write('../other-clone/src/remote.txt', 'remote work\n')
    await repo.git(['add', '.'], clonePath)
    await repo.git(['commit', '--message', 'remote change'], clonePath)
    await repo.git(['push', 'origin', 'master'], clonePath)
    await repo.git(['checkout', '-b', 'feature'])
    await repo.commit('feature change', { 'src/feature.ts': 'export const shipped = true\n' })

    const plan = await planShip({ cwd: repo.root, target: 'master' })
    expect(plan.targetState).toBe('behind')

    const result = await prepareShip(plan)

    expect(result.targetBranch).toBe('master')
    expect(await repo.git(['branch', '--show-current'])).toBe('master')
    await repo.git(['cat-file', '-e', 'HEAD:src/remote.txt'])
    await repo.git(['cat-file', '-e', 'HEAD:src/feature.ts'])
  })

  it('aborts a conflicting merge and returns to the feature branch', async () => {
    const repo = await repository()
    await repo.git(['checkout', '-b', 'feature'])
    await repo.commit('feature change', { 'src/value.txt': 'feature\n' })
    await repo.git(['checkout', 'master'])
    await repo.commit('master change', { 'src/value.txt': 'master\n' })
    await repo.git(['push', 'origin', 'master'])
    await repo.git(['checkout', 'feature'])
    const plan = await planShip({ cwd: repo.root, target: 'master' })

    await expect(prepareShip(plan)).rejects.toBeInstanceOf(MergeConflict)
    expect(await repo.git(['branch', '--show-current'])).toBe('feature')
    expect(await repo.git(['status', '--porcelain'])).toBe('')
    expect(await repo.git(['rev-parse', '--verify', '--quiet', 'MERGE_HEAD']).catch(() => '')).toBe(
      '',
    )
  })
})
