import { describe, expect, it } from 'vitest'
import { inspectGitSafety, type GitSafetyInput } from '../../src/git/git-safety.js'
import type { RepositoryState, UpstreamState } from '../../src/domain/repository.js'

function stateWith(overrides: Partial<RepositoryState> = {}): RepositoryState {
  return {
    root: '/tmp/repo',
    head: {
      kind: 'branch',
      branch: 'main',
      sha: 'a'.repeat(40),
      upstream: {
        kind: 'tracked',
        remote: 'origin',
        ref: 'origin/main',
        sha: 'a'.repeat(40),
        ahead: 0,
        behind: 0,
      },
    },
    workingTree: { kind: 'clean' },
    statusDigest: 'digest',
    remotes: ['origin'],
    defaultBranch: 'main',
    ...overrides,
  }
}

function inputWith(overrides: Partial<GitSafetyInput> = {}): GitSafetyInput {
  return { state: stateWith(), remote: 'origin', releaseBranch: 'main', tag: null, ...overrides }
}

function upstream(ahead: number, behind: number): UpstreamState {
  return {
    kind: 'tracked',
    remote: 'origin',
    ref: 'origin/main',
    sha: 'b'.repeat(40),
    ahead,
    behind,
  }
}

describe('inspectGitSafety', () => {
  it('finds nothing wrong with a clean, synced repository', () => {
    expect(inspectGitSafety(inputWith())).toEqual([])
  })

  it('reports a dirty working tree with its entries', () => {
    const state = stateWith({ workingTree: { kind: 'dirty', entries: [' M a.ts'] } })

    expect(inspectGitSafety(inputWith({ state }))).toEqual([
      { kind: 'dirty-working-tree', entries: [' M a.ts'] },
    ])
  })

  it('reports a detached HEAD without branch findings', () => {
    const state = stateWith({ head: { kind: 'detached', sha: 'c'.repeat(40) } })

    expect(inspectGitSafety(inputWith({ state }))).toEqual([
      { kind: 'detached-head', sha: 'c'.repeat(40) },
    ])
  })

  it('reports a missing remote', () => {
    const state = stateWith({ remotes: [] })

    expect(inspectGitSafety(inputWith({ state }))).toContainEqual({
      kind: 'missing-remote',
      remote: 'origin',
    })
  })

  it('reports releasing from a branch other than the configured one', () => {
    expect(inspectGitSafety(inputWith({ releaseBranch: 'release' }))).toEqual([
      { kind: 'wrong-branch', expected: 'release', actual: 'main' },
    ])
  })

  it('reports a branch without an upstream', () => {
    const state = stateWith({
      head: { kind: 'branch', branch: 'main', sha: 'a'.repeat(40), upstream: { kind: 'none' } },
    })

    expect(inspectGitSafety(inputWith({ state }))).toEqual([
      { kind: 'no-upstream', branch: 'main' },
    ])
  })

  it('separates behind from diverged', () => {
    const behind = stateWith({
      head: { kind: 'branch', branch: 'main', sha: 'a'.repeat(40), upstream: upstream(0, 2) },
    })
    const diverged = stateWith({
      head: { kind: 'branch', branch: 'main', sha: 'a'.repeat(40), upstream: upstream(3, 2) },
    })

    expect(inspectGitSafety(inputWith({ state: behind }))).toEqual([
      { kind: 'behind-upstream', branch: 'main', behind: 2 },
    ])
    expect(inspectGitSafety(inputWith({ state: diverged }))).toEqual([
      { kind: 'diverged-from-upstream', branch: 'main', ahead: 3, behind: 2 },
    ])
  })

  it('reports a branch that is only ahead as safe', () => {
    const state = stateWith({
      head: { kind: 'branch', branch: 'main', sha: 'a'.repeat(40), upstream: upstream(4, 0) },
    })

    expect(inspectGitSafety(inputWith({ state }))).toEqual([])
  })

  it('reports an existing tag locally and on the remote independently', () => {
    const tag = { name: 'v1.0.0', localSha: 'd'.repeat(40), remoteSha: null }

    expect(inspectGitSafety(inputWith({ tag }))).toEqual([
      { kind: 'tag-exists-locally', tag: 'v1.0.0', sha: 'd'.repeat(40) },
    ])

    const both = inspectGitSafety(inputWith({ tag: { ...tag, remoteSha: 'e'.repeat(40) } }))

    expect(both).toEqual([
      { kind: 'tag-exists-locally', tag: 'v1.0.0', sha: 'd'.repeat(40) },
      {
        kind: 'tag-exists-on-remote',
        tag: 'v1.0.0',
        remote: 'origin',
        sha: 'e'.repeat(40),
      },
    ])
  })
})
