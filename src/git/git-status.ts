import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import type { HeadState, UpstreamState, WorkingTreeState } from '../domain/repository.js'
import { type GitCommand, splitLines } from './git-command.js'

export type GitRepositoryLocation =
  | { kind: 'found'; root: string }
  | { kind: 'no-commits'; root: string }
  | { kind: 'not-a-repository'; path: string }

const RENAME_STATUS_CODES = new Set(['R', 'C'])

export async function locateRepository(
  git: GitCommand,
  path: string,
): Promise<GitRepositoryLocation> {
  const root = await git.readText(['rev-parse', '--show-toplevel'])

  if (root === null || root.length === 0) {
    return { kind: 'not-a-repository', path }
  }

  const resolved = await realpath(root)
  const head = await git.readText(['rev-parse', '--verify', '--quiet', 'HEAD'])

  if (head === null || head.length === 0) {
    return { kind: 'no-commits', root: resolved }
  }

  return { kind: 'found', root: resolved }
}

export function parsePorcelainStatus(output: string): string[] {
  const fields = output.split('\0')
  const entries: string[] = []
  let index = 0

  while (index < fields.length) {
    const field = fields[index]
    index += 1

    if (field === undefined || field.length < 4) {
      continue
    }

    const code = field.slice(0, 2)
    const path = field.slice(3)

    if (RENAME_STATUS_CODES.has(code.slice(0, 1)) || RENAME_STATUS_CODES.has(code.slice(1, 2))) {
      const origin = fields[index]
      index += 1
      entries.push(`${code} ${origin ?? ''} -> ${path}`)
      continue
    }

    entries.push(`${code} ${path}`)
  }

  return entries
}

export async function readWorkingTree(git: GitCommand): Promise<WorkingTreeState> {
  const result = await git.runOrThrow(['status', '--porcelain=v1', '-z'])
  const entries = parsePorcelainStatus(result.stdout)

  if (entries.length === 0) {
    return { kind: 'clean' }
  }

  return { kind: 'dirty', entries }
}

export async function readStatusDigest(git: GitCommand): Promise<string> {
  const result = await git.runOrThrow(['status', '--porcelain=v1'])
  return createHash('sha256').update(result.stdout).digest('hex')
}

export async function readCurrentBranch(git: GitCommand): Promise<string | null> {
  const branch = await git.readText(['symbolic-ref', '--quiet', '--short', 'HEAD'])
  return branch === null || branch.length === 0 ? null : branch
}

export async function readHeadSha(git: GitCommand): Promise<string> {
  const result = await git.runOrThrow(['rev-parse', 'HEAD'])
  return result.stdout.trim()
}

function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const [behind, ahead] = output.trim().split(/\s+/)
  return { ahead: Number(ahead ?? 0), behind: Number(behind ?? 0) }
}

export async function readUpstream(git: GitCommand, branch: string): Promise<UpstreamState> {
  const described = await git.readText([
    'for-each-ref',
    '--format=%(upstream:short) %(upstream:remotename)',
    `refs/heads/${branch}`,
  ])

  const [ref, remote] = (described ?? '').split(' ')

  if (ref === undefined || ref.length === 0 || remote === undefined || remote.length === 0) {
    return { kind: 'none' }
  }

  const sha = await git.readText(['rev-parse', '--verify', '--quiet', ref])

  if (sha === null || sha.length === 0) {
    return { kind: 'none' }
  }

  const counts = await git.readText(['rev-list', '--left-right', '--count', `${ref}...HEAD`])
  const { ahead, behind } = parseAheadBehind(counts ?? '0 0')

  return { kind: 'tracked', remote, ref, sha, ahead, behind }
}

export async function readHead(git: GitCommand): Promise<HeadState> {
  const sha = await readHeadSha(git)
  const branch = await readCurrentBranch(git)

  if (branch === null) {
    return { kind: 'detached', sha }
  }

  return { kind: 'branch', branch, sha, upstream: await readUpstream(git, branch) }
}

export async function readRemotes(git: GitCommand): Promise<string[]> {
  const output = await git.readText(['remote'])
  return output === null ? [] : splitLines(output)
}

export async function readRemoteUrl(git: GitCommand, remote: string): Promise<string | null> {
  const url = await git.readText(['remote', 'get-url', remote])
  return url === null || url.length === 0 ? null : url
}

export async function readDefaultBranch(git: GitCommand, remote: string): Promise<string | null> {
  const ref = await git.readText([
    'symbolic-ref',
    '--quiet',
    '--short',
    `refs/remotes/${remote}/HEAD`,
  ])

  if (ref === null || ref.length === 0) {
    return null
  }

  const prefix = `${remote}/`
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref
}
