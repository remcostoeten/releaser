import { CommandFailed, MergeConflict } from '../domain/errors.js'
import { type BranchName, Sha } from '../domain/semantic.js'
import type { GitCommand } from './git-command.js'
import { splitLines } from './git-command.js'
import { readHeadSha } from './git-status.js'

export async function resolveBranchSha(git: GitCommand, branch: BranchName): Promise<Sha | null> {
  const output = await git.readText(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
  return output === null ? null : Sha.from(output, `git rev-parse refs/heads/${branch}`)
}

export async function operationInProgress(git: GitCommand): Promise<boolean> {
  const paths = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']
  const results = await Promise.all(
    paths.map((path) => git.readText(['rev-parse', '--verify', '--quiet', path])),
  )
  if (results.some((result) => result !== null)) {
    return true
  }
  const directory = await git.readText(['rev-parse', '--git-path', 'rebase-merge'])
  const applyDirectory = await git.readText(['rev-parse', '--git-path', 'rebase-apply'])
  const checks = await Promise.all([directory, applyDirectory].map((path) => pathExists(git, path)))
  return checks.some(Boolean)
}

async function pathExists(git: GitCommand, path: string | null): Promise<boolean> {
  if (path === null) {
    return false
  }
  try {
    await access(isAbsolute(path) ? path : join(git.cwd, path))
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export async function commitAllChanges(git: GitCommand, message: string): Promise<Sha> {
  await git.runOrThrow(['add', '--all'])
  await git.runOrThrow(['commit', '--message', message])
  return readHeadSha(git)
}

export async function fetchTargetBranch(
  git: GitCommand,
  remote: string,
  target: BranchName,
): Promise<void> {
  await git.runOrThrow([
    'fetch',
    '--no-tags',
    remote,
    `refs/heads/${target}:refs/remotes/${remote}/${target}`,
  ])
}

export async function checkoutBranch(git: GitCommand, branch: BranchName): Promise<void> {
  await git.runOrThrow(['checkout', branch])
}

export async function checkoutTargetBranch(
  git: GitCommand,
  remote: string,
  branch: BranchName,
  existsLocally: boolean,
): Promise<void> {
  if (existsLocally) {
    return checkoutBranch(git, branch)
  }
  await git.runOrThrow(['checkout', '-b', branch, '--track', `${remote}/${branch}`])
}

export async function fastForwardTarget(
  git: GitCommand,
  remote: string,
  target: BranchName,
): Promise<void> {
  await git.runOrThrow(['merge', '--ff-only', `${remote}/${target}`])
}

export async function mergeFeatureBranch(
  git: GitCommand,
  source: BranchName,
  target: BranchName,
  message: string,
): Promise<Sha> {
  const result = await git.run(['merge', '--no-ff', source, '--message', message])
  if (result.exitCode === 0) {
    return readHeadSha(git)
  }
  const conflicts = await git.readText(['diff', '--name-only', '--diff-filter=U'])
  await git.run(['merge', '--abort'])
  await checkoutBranch(git, source)
  const files = conflicts === null ? [] : splitLines(conflicts)
  if (files.length > 0) {
    throw new MergeConflict(source, target, files)
  }
  throw new CommandFailed(result.commandLine, result.exitCode, result.stdout, result.stderr)
}
import { access } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
