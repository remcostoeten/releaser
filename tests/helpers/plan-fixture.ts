import { createReleasePlan, type ReleasePlan } from '../../src/domain/release-plan.js'

export function examplePlan(): ReleasePlan {
  return createReleasePlan({
    id: 'plan-0001',
    createdAt: '2026-01-01T00:00:00.000Z',
    repositoryRoot: '/tmp/repo',
    packageName: 'example-package',
    fingerprint: {
      headSha: 'a'.repeat(40),
      statusDigest: 'digest-clean',
      manifestVersion: '1.2.3',
      upstreamSha: 'b'.repeat(40),
    },
    boundary: {
      kind: 'since-release',
      previousRef: 'v1.2.3',
      previousSha: 'c'.repeat(40),
      previousVersion: '1.2.3',
      headSha: 'a'.repeat(40),
    },
    version: {
      previousVersion: '1.2.3',
      nextVersion: '1.3.0-beta.0',
      selection: { kind: 'prerelease', identifier: 'beta' },
      distTag: { kind: 'prerelease', tag: 'beta', source: 'identifier' },
      prerelease: true,
    },
    fileMutations: [
      {
        kind: 'manifest-version',
        path: 'package.json',
        previousVersion: '1.2.3',
        nextVersion: '1.3.0-beta.0',
        edits: [{ offset: 42, deletedText: '1.2.3', insertedText: '1.3.0-beta.0' }],
      },
      {
        kind: 'configured-replacement',
        path: 'README.md',
        pattern: { kind: 'regex', source: 'version: (.+)', flags: 'g' },
        expectedMatches: 1,
        edits: [{ offset: 10, deletedText: '1.2.3', insertedText: '1.3.0-beta.0' }],
      },
    ],
    commit: { message: 'chore(release): 1.3.0-beta.0', paths: ['README.md', 'package.json'] },
    tag: { name: 'v1.3.0-beta.0', message: '1.3.0-beta.0' },
    pushBranch: { remote: 'origin', target: { kind: 'branch', branch: 'main' } },
    pushTag: { remote: 'origin', target: { kind: 'tag', tag: 'v1.3.0-beta.0' } },
    npmPublish: {
      kind: 'publish',
      packageName: 'example-package',
      version: '1.3.0-beta.0',
      distTag: 'beta',
      access: 'public',
    },
    githubRelease: {
      kind: 'create',
      owner: 'remcostoeten',
      repo: 'releaser',
      tagName: 'v1.3.0-beta.0',
      name: 'v1.3.0-beta.0',
      body: '## Features\n\n- something',
      draft: false,
      prerelease: true,
    },
    notes: {
      version: '1.3.0-beta.0',
      previousVersion: '1.2.3',
      sections: [
        {
          category: 'features',
          changes: [
            {
              id: 'pr-12',
              title: 'something',
              category: 'features',
              author: 'remcostoeten',
              origin: { kind: 'pull-request', number: 12, mergeCommitSha: 'd'.repeat(40) },
            },
          ],
        },
      ],
    },
  })
}
