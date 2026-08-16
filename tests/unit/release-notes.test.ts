import { describe, expect, it } from 'vitest'
import type { CommitSummary, PullRequestSummary } from '../../src/domain/changes.js'
import { collectReleaseNotes } from '../../src/notes/collect.js'
import { renderReleaseNotes } from '../../src/notes/render.js'
import { commitAuthoredAt, pullRequestMergedAt, sha, version } from '../helpers/semantic.js'

function commit(
  value: string,
  subject: string,
  body = '',
  author = 'Releaser Test',
): CommitSummary {
  return {
    sha: sha(value.repeat(40)),
    subject,
    body,
    author,
    authoredAt: commitAuthoredAt('2026-01-02T12:00:00Z'),
    parents: [],
  }
}

function pullRequest(
  number: number,
  title: string,
  mergeCommitSha: string | null,
  labels: string[] = [],
): PullRequestSummary {
  return {
    number,
    title,
    author: 'octocat',
    mergedAt: pullRequestMergedAt('2026-01-03T12:00:00Z'),
    mergeCommitSha: mergeCommitSha === null ? null : sha(mergeCommitSha.repeat(40)),
    labels,
  }
}

describe('release notes collection', () => {
  it('categorizes conventional commits and breaking changes into fixed section order', () => {
    const notes = collectReleaseNotes({
      version: version('2.0.0'),
      previousVersion: version('1.0.0'),
      commits: [
        commit('a', 'docs: explain recovery'),
        commit('b', 'feat!: remove the old API'),
        commit('c', 'perf(core): reduce allocations'),
        commit('d', 'A descriptive change'),
      ],
      pullRequests: [],
    })

    expect(notes.sections.map((section) => section.category)).toEqual([
      'breaking',
      'performance',
      'documentation',
      'other',
    ])
  })

  it('uses PR labels and replaces its merge commit with one PR change', () => {
    const notes = collectReleaseNotes({
      version: version('1.1.0'),
      previousVersion: version('1.0.0'),
      commits: [commit('a', 'Merge pull request #42'), commit('b', 'fix: retain this commit')],
      pullRequests: [
        pullRequest(42, 'Add the release wizard', 'a', ['enhancement']),
        pullRequest(42, 'Add the release wizard', 'a', ['enhancement']),
      ],
    })

    expect(notes.sections).toMatchObject([
      {
        category: 'features',
        changes: [
          {
            id: 'pr-42',
            title: 'Add the release wizard',
            origin: { kind: 'pull-request', number: 42, mergeCommitSha: 'a'.repeat(40) },
          },
        ],
      },
      {
        category: 'fixes',
        changes: [{ title: 'fix: retain this commit' }],
      },
    ])
  })

  it('treats a BREAKING CHANGE footer as breaking', () => {
    const notes = collectReleaseNotes({
      version: version('2.0.0'),
      previousVersion: version('1.0.0'),
      commits: [commit('a', 'refactor: replace parser', 'BREAKING CHANGE: removes legacy syntax')],
      pullRequests: [],
    })

    expect(notes.sections[0]?.category).toBe('breaking')
  })
})

describe('release notes rendering', () => {
  it('renders stable GitHub-flavoured Markdown with PR and commit references', () => {
    const notes = collectReleaseNotes({
      version: version('1.1.0'),
      previousVersion: version('1.0.0'),
      commits: [commit('b', 'fix: avoid duplicate tags')],
      pullRequests: [pullRequest(42, 'Add the release wizard', 'a', ['feature'])],
    })

    expect(renderReleaseNotes(notes)).toBe(
      [
        '## Features',
        '',
        '- Add the release wizard (#42) by @octocat',
        '',
        '## Fixes',
        '',
        '- fix: avoid duplicate tags (bbbbbbb) by Releaser Test',
      ].join('\n'),
    )
  })

  it('renders an explicit message for an empty boundary', () => {
    expect(
      renderReleaseNotes({
        version: version('1.0.0'),
        previousVersion: null,
        sections: [],
      }),
    ).toBe('No changes were found for this release.')
  })
})
