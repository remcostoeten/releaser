import { createReleasePlan, type ReleasePlan } from '../../src/domain/release-plan.js'
import {
  absolutePath,
  branch,
  digest,
  distTag,
  packageName,
  planId,
  repoPath,
  sha,
  tag,
  timestamp,
  version,
} from './semantic.js'

export function examplePlan(): ReleasePlan {
  return createReleasePlan({
    id: planId('plan-0001'),
    createdAt: timestamp('2026-01-01T00:00:00.000Z'),
    repositoryRoot: absolutePath('/tmp/repo'),
    packageName: packageName('example-package'),
    fingerprint: {
      headSha: sha('a'.repeat(40)),
      statusDigest: digest('0'.repeat(64)),
      manifestVersion: version('1.2.3'),
      upstreamSha: sha('b'.repeat(40)),
    },
    boundary: {
      kind: 'since-release',
      previousRef: tag('v1.2.3'),
      previousSha: sha('c'.repeat(40)),
      previousVersion: version('1.2.3'),
      headSha: sha('a'.repeat(40)),
    },
    version: {
      previousVersion: version('1.2.3'),
      nextVersion: version('1.3.0-beta.0'),
      selection: { kind: 'prerelease', identifier: 'beta' },
      distTag: { kind: 'prerelease', tag: distTag('beta'), source: 'identifier' },
      prerelease: true,
    },
    fileMutations: [
      {
        kind: 'manifest-version',
        path: repoPath('package.json'),
        previousVersion: version('1.2.3'),
        nextVersion: version('1.3.0-beta.0'),
        edits: [{ offset: 42, deletedText: '1.2.3', insertedText: '1.3.0-beta.0' }],
      },
      {
        kind: 'configured-replacement',
        path: repoPath('README.md'),
        pattern: { kind: 'regex', source: 'version: (.+)', flags: 'g' },
        expectedMatches: 1,
        edits: [{ offset: 10, deletedText: '1.2.3', insertedText: '1.3.0-beta.0' }],
      },
    ],
    commit: {
      message: 'chore(release): 1.3.0-beta.0',
      paths: [repoPath('README.md'), repoPath('package.json')],
    },
    tag: { name: tag('v1.3.0-beta.0'), message: '1.3.0-beta.0' },
    pushBranch: { remote: 'origin', target: { kind: 'branch', branch: branch('main') } },
    pushTag: { remote: 'origin', target: { kind: 'tag', tag: tag('v1.3.0-beta.0') } },
    npmPublish: {
      kind: 'publish',
      packageName: packageName('example-package'),
      version: version('1.3.0-beta.0'),
      distTag: distTag('beta'),
      access: 'public',
    },
    githubRelease: {
      kind: 'create',
      owner: 'remcostoeten',
      repo: 'releaser',
      tagName: tag('v1.3.0-beta.0'),
      name: 'v1.3.0-beta.0',
      body: '## Features\n\n- something',
      draft: false,
      prerelease: true,
    },
    notes: {
      version: version('1.3.0-beta.0'),
      previousVersion: version('1.2.3'),
      sections: [
        {
          category: 'features',
          changes: [
            {
              id: 'pr-12',
              title: 'something',
              category: 'features',
              author: 'remcostoeten',
              origin: { kind: 'pull-request', number: 12, mergeCommitSha: sha('d'.repeat(40)) },
            },
          ],
        },
      ],
    },
  })
}
