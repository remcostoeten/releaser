import { constants } from 'node:fs'
import { chmod, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { PublishedPackageMismatch, StalePlan, VersionAlreadyPublished } from '../domain/errors.js'
import { applyEdits, editsApplyTo, type TextEdit } from '../domain/mutations.js'
import type { ReleasePlan } from '../domain/release-plan.js'
import type { RepoRelativePath, Sha } from '../domain/semantic.js'
import { createAnnotatedTag, createReleaseCommit, pushBranch, pushTag } from '../git/git-writer.js'
import type { GitReader } from '../git/git-reader.js'
import { readHeadSha } from '../git/git-status.js'
import type { GitHubClient } from '../github/github-client.js'
import { createGitHubRelease } from '../github/github-writer.js'
import type { JournalStorageOptions } from '../journal/storage.js'
import { openJournalSession } from '../journal/storage.js'
import type { createNpmClient } from '../npm/npm-client.js'
import { createPackageReader } from '../npm/package.js'
import { createMutationDiffs } from '../versioning/diff.js'
import type {
  ExecutionContext,
  ExecutionDependencies,
  ExecutionStage,
  PublishStage,
  StageCheck,
} from './execution-ports.js'

type NpmClient = ReturnType<typeof createNpmClient>

export type ExecutionInfrastructure = {
  git: GitReader
  npm: NpmClient
  github: GitHubClient | null
  journal?: JournalStorageOptions
}

type PathEdits = { path: RepoRelativePath; edits: TextEdit[] }

function groupedEdits(plan: ReleasePlan): PathEdits[] {
  const byPath = new Map<RepoRelativePath, TextEdit[]>()
  for (const mutation of plan.fileMutations) {
    const edits = byPath.get(mutation.path) ?? []
    edits.push(...mutation.edits)
    byPath.set(mutation.path, edits)
  }
  return [...byPath].map(([path, edits]) => ({ path, edits }))
}

function editsAreApplied(content: string, edits: readonly TextEdit[]): boolean {
  let delta = 0
  for (const edit of edits.toSorted((left, right) => left.offset - right.offset)) {
    const offset = edit.offset + delta
    if (content.slice(offset, offset + edit.insertedText.length) !== edit.insertedText) {
      return false
    }
    delta += edit.insertedText.length - edit.deletedText.length
  }
  return true
}

async function inspectFileMutations(plan: ReleasePlan): Promise<StageCheck> {
  const inspections = await Promise.all(
    groupedEdits(plan).map(async (mutation) => {
      const content = await readFile(join(plan.repositoryRoot, mutation.path), 'utf8')
      if (editsApplyTo(content, mutation.edits)) {
        return 'pending'
      }
      if (editsAreApplied(content, mutation.edits)) {
        return 'applied'
      }
      throw new StalePlan(`file:${mutation.path}`, 'planned pre-state or post-state', 'diverged')
    }),
  )
  const pending = inspections.filter((inspection) => inspection === 'pending').length
  const applied = inspections.filter((inspection) => inspection === 'applied').length
  if (pending > 0 && applied > 0) {
    throw new StalePlan('fileMutations', 'all pending or all applied', 'partially applied')
  }
  return pending === 0 ? { kind: 'complete', details: { files: applied } } : { kind: 'pending' }
}

async function atomicFileWrite(path: string, content: string): Promise<void> {
  const metadata = await stat(path)
  const temporary = `${path}.${process.pid}.${Date.now()}.releaser.tmp`
  const handle = await open(
    temporary,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    metadata.mode,
  )
  try {
    await handle.writeFile(content, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await chmod(temporary, metadata.mode)
    await rename(temporary, path)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function createFileStage(): ExecutionStage {
  return {
    check: inspectFileMutations,
    async write(plan) {
      await Promise.all(
        groupedEdits(plan).map(async (mutation) => {
          const path = join(plan.repositoryRoot, mutation.path)
          const content = await readFile(path, 'utf8')
          await atomicFileWrite(path, applyEdits(content, mutation.edits))
        }),
      )
      return { details: { files: plan.fileMutations.map((mutation) => mutation.path) } }
    },
  }
}

async function commitCheck(git: GitReader, plan: ReleasePlan): Promise<StageCheck> {
  const head = await readHeadSha(git.command)
  if (head === plan.fingerprint.headSha) {
    return { kind: 'pending' }
  }
  const [parent, message, changed] = await Promise.all([
    git.command.readText(['rev-parse', 'HEAD^']),
    git.command.readText(['log', '-1', '--format=%B']),
    git.command.readText(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']),
  ])
  const changedPaths = (changed ?? '').split('\n').filter(Boolean).toSorted()
  const plannedPaths = [...plan.commit.paths].toSorted()
  if (
    parent === plan.fingerprint.headSha &&
    message?.trim() === plan.commit.message.trim() &&
    JSON.stringify(changedPaths) === JSON.stringify(plannedPaths)
  ) {
    return { kind: 'complete', releaseCommitSha: head, details: { sha: head } }
  }
  throw new StalePlan('headSha', plan.fingerprint.headSha, head)
}

function requireReleaseCommit(context: ExecutionContext): Sha {
  if (context.releaseCommitSha === null) {
    throw new StalePlan('releaseCommitSha', 'resolved release commit', null)
  }
  return context.releaseCommitSha
}

function createGitStages(
  git: GitReader,
): Pick<ExecutionDependencies['stages'], 'commit' | 'tag' | 'push-branch' | 'push-tag'> {
  return {
    commit: {
      check: (plan) => commitCheck(git, plan),
      async write(plan) {
        const result = await createReleaseCommit(git.command, plan.commit)
        return { releaseCommitSha: result.sha, details: { sha: result.sha } }
      },
    },
    tag: {
      async check(plan, context) {
        const expected = requireReleaseCommit(context)
        const actual = await git.resolveLocalTag(plan.tag.name)
        if (actual === null) {
          return { kind: 'pending' }
        }
        if (actual !== expected) {
          throw new StalePlan('localTag', expected, actual)
        }
        return { kind: 'complete', details: { sha: actual } }
      },
      async write(plan, context) {
        const result = await createAnnotatedTag(
          git.command,
          plan.tag,
          requireReleaseCommit(context),
        )
        return { details: { sha: result.sha } }
      },
    },
    'push-branch': {
      async check(plan, context) {
        const expected = requireReleaseCommit(context)
        const target = plan.pushBranch.target
        if (target.kind !== 'branch') {
          throw new Error('push-branch plan target is not a branch')
        }
        const actual = await git.readRemoteBranchSha(target.branch)
        return actual === expected
          ? { kind: 'complete', details: { sha: actual } }
          : { kind: 'pending' }
      },
      async write(plan, context) {
        const target = plan.pushBranch.target
        if (target.kind !== 'branch') {
          throw new Error('push-branch plan target is not a branch')
        }
        const result = await pushBranch(
          git.command,
          plan.pushBranch.remote,
          target.branch,
          requireReleaseCommit(context),
        )
        return { details: { sha: result.sha } }
      },
    },
    'push-tag': {
      async check(plan, context) {
        const expected = requireReleaseCommit(context)
        const actual = await git.resolveRemoteTag(plan.tag.name)
        if (actual === null) {
          return { kind: 'pending' }
        }
        if (actual !== expected) {
          throw new StalePlan('remoteTag', expected, actual)
        }
        return { kind: 'complete', details: { sha: actual } }
      },
      async write(plan, context) {
        const result = await pushTag(
          git.command,
          plan.pushTag.remote,
          plan.tag.name,
          requireReleaseCommit(context),
        )
        return { details: { sha: result.sha } }
      },
    },
  }
}

function createPublishStage(npm: NpmClient): PublishStage {
  async function check(plan: ReleasePlan): Promise<StageCheck> {
    if (plan.npmPublish.kind !== 'publish') {
      return { kind: 'complete', details: { reason: plan.npmPublish.reason } }
    }
    if (!(await npm.versionExists(plan.packageName, plan.version.nextVersion))) {
      return { kind: 'pending' }
    }
    const [publishedShasum, local] = await Promise.all([
      npm.readVersionShasum(plan.packageName, plan.version.nextVersion),
      npm.packDryRun(),
    ])
    if (publishedShasum === null) {
      throw new VersionAlreadyPublished(`${plan.packageName}@${plan.version.nextVersion}`)
    }
    if (publishedShasum !== local.shasum) {
      throw new PublishedPackageMismatch(
        `${plan.packageName}@${plan.version.nextVersion}`,
        local.shasum,
        publishedShasum,
      )
    }
    return { kind: 'complete', details: { shasum: publishedShasum } }
  }

  async function publish(plan: ReleasePlan, otp?: string) {
    if (plan.npmPublish.kind !== 'publish') {
      return { details: { reason: plan.npmPublish.reason } }
    }
    const attempt = await npm.attemptPublish({
      packageName: plan.npmPublish.packageName,
      version: plan.npmPublish.version,
      access: plan.npmPublish.access,
      tag: plan.npmPublish.distTag,
      ...(otp === undefined ? {} : { otp }),
    })
    if (attempt.kind === 'unknown') {
      throw new Error(`npm publish exited with code ${attempt.exitCode}`)
    }
    return { details: { shasum: attempt.inspection.shasum } }
  }

  return {
    check,
    write: (plan) => publish(plan),
    writeWithOtp: (plan, _context, otp) => publish(plan, otp),
  }
}

function createGitHubStage(client: GitHubClient | null): ExecutionStage {
  return {
    async check(plan) {
      if (plan.githubRelease.kind !== 'create') {
        return { kind: 'complete', details: { reason: plan.githubRelease.reason } }
      }
      if (client === null) {
        throw new Error('GitHub client is required by this release plan')
      }
      const release = await client.readReleaseByTag(
        { host: 'github.com', owner: plan.githubRelease.owner, repo: plan.githubRelease.repo },
        plan.githubRelease.tagName,
      )
      return release === null
        ? { kind: 'pending' }
        : { kind: 'complete', details: { url: release.url } }
    },
    async write(plan, context) {
      if (plan.githubRelease.kind !== 'create' || client === null) {
        throw new Error('GitHub release stage is not configured')
      }
      const result = await createGitHubRelease(client, {
        repository: {
          host: 'github.com',
          owner: plan.githubRelease.owner,
          repo: plan.githubRelease.repo,
        },
        tag: plan.githubRelease.tagName,
        targetCommit: requireReleaseCommit(context),
        title: plan.githubRelease.name,
        body: plan.githubRelease.body,
        draft: plan.githubRelease.draft,
        prerelease: plan.githubRelease.prerelease,
      })
      return { details: { url: result.release.url } }
    },
  }
}

export function createExecutionDependencies(
  infrastructure: ExecutionInfrastructure,
): ExecutionDependencies {
  const gitStages = createGitStages(infrastructure.git)
  return {
    async readFingerprint(plan) {
      const versionFile = plan.fileMutations.find(
        (mutation) => mutation.kind === 'manifest-version',
      )?.path
      const manifest = await createPackageReader(
        plan.repositoryRoot,
        versionFile ?? 'package.json',
      ).read()
      if (manifest.kind !== 'found') {
        throw new StalePlan('manifestVersion', plan.fingerprint.manifestVersion, 'unreadable')
      }
      return infrastructure.git.readFingerprint(manifest.manifest.version)
    },
    stages: {
      'mutate-files': createFileStage(),
      ...gitStages,
      'github-release': createGitHubStage(infrastructure.github),
    },
    publish: createPublishStage(infrastructure.npm),
    dryRun: {
      previewFileMutations: (plan) => createMutationDiffs(plan.repositoryRoot, plan.fileMutations),
      inspectPackage: () => infrastructure.npm.packDryRun(),
      publishDryRun(plan) {
        if (plan.npmPublish.kind !== 'publish') {
          return Promise.resolve({ skipped: true, reason: plan.npmPublish.reason })
        }
        return infrastructure.npm.publishDryRun(plan.npmPublish.access, plan.npmPublish.distTag)
      },
    },
    journal: {
      open: (repositoryRoot) => openJournalSession(repositoryRoot, infrastructure.journal),
    },
  }
}
