import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotesReader } from '../../src/application/create-notes-reader.js'
import { createGitReader } from '../../src/git/git-reader.js'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'
import { pullRequestMergedAt, sha, tag, version } from '../helpers/semantic.js'

const repositories: TempRepository[] = []

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()))
})

describe('release notes source integration', () => {
  it('reads only the tag-to-HEAD boundary from a real repository and merges mocked GitHub PRs', async () => {
    const repository = await createTempRepository({ withOrigin: true })
    repositories.push(repository)
    const initialSha = await repository.commit('chore: initial', {
      'package.json': '{"version":"1.0.0"}\n',
    })
    await repository.git(['tag', '--annotate', 'v1.0.0', '--message', 'v1.0.0'])
    const featureSha = await repository.commit('Merge pull request #7', { 'feature.ts': 'true\n' })
    await repository.commit('fix: preserve journal', { 'journal.ts': 'true\n' })
    const headSha = await repository.head()
    const git = createGitReader(repository.runner, { cwd: repository.root, remote: 'origin' })
    const readPullRequests = vi.fn(async () => [
      {
        number: 7,
        title: 'feat: add release notes',
        author: 'contributor',
        mergedAt: pullRequestMergedAt('2026-01-03T12:00:00Z'),
        mergeCommitSha: featureSha,
        labels: ['feature'],
      },
    ])
    const reader = createNotesReader({
      readCommits: (boundary) =>
        git.readCommits({
          from: boundary.kind === 'initial' ? null : boundary.previousSha,
          to: boundary.headSha,
        }),
      readPullRequests,
    })

    const notes = await reader.collect({
      boundary: {
        kind: 'since-release',
        previousRef: tag('v1.0.0'),
        previousSha: initialSha,
        previousVersion: version('1.0.0'),
        headSha,
      },
      version: version('1.0.1'),
      previousVersion: version('1.0.0'),
      githubRepository: { owner: 'example', repo: 'tool' },
      includePullRequests: true,
    })

    expect(notes.sections).toMatchObject([
      { category: 'features', changes: [{ title: 'feat: add release notes' }] },
      { category: 'fixes', changes: [{ title: 'fix: preserve journal' }] },
    ])
    expect(readPullRequests).toHaveBeenCalledOnce()
  })

  it('does not call GitHub when PR collection is unavailable', async () => {
    const readPullRequests = vi.fn(async () => [])
    const reader = createNotesReader({
      readCommits: async () => [],
      readPullRequests,
    })

    await reader.collect({
      boundary: { kind: 'initial', headSha: sha('a'.repeat(40)) },
      version: version('1.0.0'),
      previousVersion: null,
      githubRepository: null,
      includePullRequests: false,
    })

    expect(readPullRequests).not.toHaveBeenCalled()
  })
})
