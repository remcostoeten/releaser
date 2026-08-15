import type { GitCommitAction, GitTagAction } from '../domain/actions.js'
import { TagExists } from '../domain/errors.js'
import type { BranchName, Sha, TagName } from '../domain/semantic.js'
import type { GitCommand } from './git-command.js'
import { readRemoteBranchSha, resolveLocalTag, resolveRemoteTag } from './git-refs.js'
import { readHeadSha } from './git-status.js'

export type CommitWriteOutcome = {
  kind: 'created' | 'skipped'
  sha: Sha
}

export type TagWriteOutcome = {
  kind: 'created' | 'skipped'
  sha: Sha
}

export type PushWriteOutcome = {
  kind: 'pushed' | 'skipped'
  sha: Sha
}

async function readHeadMessage(git: GitCommand): Promise<string> {
  const result = await git.runOrThrow(['log', '-1', '--format=%B'])
  return result.stdout.trim()
}

async function indexMatchesHead(git: GitCommand): Promise<boolean> {
  const result = await git.run(['diff', '--cached', '--quiet', 'HEAD'])
  return result.exitCode === 0
}

/**
 * Stages the planned paths and creates the release commit. Re-attempting after
 * an interrupted run is safe: when `HEAD` already carries the planned message
 * and the staged tree is identical to it, the commit already happened and this
 * reports `skipped` rather than stacking a second release commit.
 */
export async function createReleaseCommit(
  git: GitCommand,
  action: GitCommitAction,
): Promise<CommitWriteOutcome> {
  if (action.paths.length > 0) {
    await git.runOrThrow(['add', '--', ...action.paths])
  }

  const message = action.message.trim()

  if ((await readHeadMessage(git)) === message && (await indexMatchesHead(git))) {
    return { kind: 'skipped', sha: await readHeadSha(git) }
  }

  await git.runOrThrow(['commit', '--message', action.message])

  return { kind: 'created', sha: await readHeadSha(git) }
}

/**
 * Creates the annotated tag at `targetSha`. An existing tag on the same commit
 * is the interrupted-run case and is skipped; an existing tag on a different
 * commit fails. The tag is never moved — a moved tag rewrites what a published
 * version means for everyone who already fetched it.
 */
export async function createAnnotatedTag(
  git: GitCommand,
  action: GitTagAction,
  targetSha: Sha,
): Promise<TagWriteOutcome> {
  const existing = await resolveLocalTag(git, action.name)

  if (existing !== null) {
    if (existing === targetSha) {
      return { kind: 'skipped', sha: existing }
    }
    throw new TagExists(action.name, 'local')
  }

  await git.runOrThrow(['tag', '--annotate', action.name, '--message', action.message, targetSha])

  return { kind: 'created', sha: targetSha }
}

export async function pushBranch(
  git: GitCommand,
  remote: string,
  branch: BranchName,
  expectedSha: Sha,
): Promise<PushWriteOutcome> {
  if ((await readRemoteBranchSha(git, remote, branch)) === expectedSha) {
    return { kind: 'skipped', sha: expectedSha }
  }

  await git.runOrThrow(['push', remote, `refs/heads/${branch}:refs/heads/${branch}`])

  return { kind: 'pushed', sha: expectedSha }
}

export async function pushTag(
  git: GitCommand,
  remote: string,
  tag: TagName,
  expectedSha: Sha,
): Promise<PushWriteOutcome> {
  const published = await resolveRemoteTag(git, remote, tag)

  if (published !== null) {
    if (published === expectedSha) {
      return { kind: 'skipped', sha: expectedSha }
    }
    throw new TagExists(tag, 'remote')
  }

  await git.runOrThrow(['push', remote, `refs/tags/${tag}:refs/tags/${tag}`])

  return { kind: 'pushed', sha: expectedSha }
}
