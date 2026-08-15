import semver from 'semver'
import { type GitCommand, splitLines } from './git-command.js'

export type GitTagRef = {
  name: string
  commitSha: string
}

export type ReleaseTag = {
  ref: string
  sha: string
  version: string
}

const PEELED_SUFFIX = '^{}'

export async function listLocalTags(git: GitCommand): Promise<GitTagRef[]> {
  const output = await git.readText([
    'for-each-ref',
    '--format=%(refname:strip=2) %(objectname) %(*objectname)',
    'refs/tags',
  ])

  if (output === null || output.length === 0) {
    return []
  }

  return splitLines(output).flatMap((line) => {
    const [name, objectName, dereferenced] = line.split(' ')
    const commitSha =
      dereferenced !== undefined && dereferenced.length > 0 ? dereferenced : objectName

    if (name === undefined || commitSha === undefined || commitSha.length === 0) {
      return []
    }

    return [{ name, commitSha }]
  })
}

export async function resolveLocalTag(git: GitCommand, tag: string): Promise<string | null> {
  const sha = await git.readText(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`])
  return sha === null || sha.length === 0 ? null : sha
}

export async function localTagExists(git: GitCommand, tag: string): Promise<boolean> {
  return (await resolveLocalTag(git, tag)) !== null
}

function parseLsRemote(output: string, refPrefix: string): Map<string, string> {
  const shaByName = new Map<string, string>()

  for (const line of splitLines(output)) {
    const [sha, ref] = line.split(/\s+/)

    if (sha === undefined || ref === undefined || !ref.startsWith(refPrefix)) {
      continue
    }

    const name = ref.slice(refPrefix.length)

    if (name.endsWith(PEELED_SUFFIX)) {
      shaByName.set(name.slice(0, -PEELED_SUFFIX.length), sha)
      continue
    }

    if (!shaByName.has(name)) {
      shaByName.set(name, sha)
    }
  }

  return shaByName
}

export async function listRemoteTags(git: GitCommand, remote: string): Promise<GitTagRef[]> {
  const output = await git.readText(['ls-remote', '--tags', remote])

  if (output === null) {
    return []
  }

  return [...parseLsRemote(output, 'refs/tags/')].map(([name, commitSha]) => ({ name, commitSha }))
}

export async function resolveRemoteTag(
  git: GitCommand,
  remote: string,
  tag: string,
): Promise<string | null> {
  const output = await git.readText([
    'ls-remote',
    '--tags',
    remote,
    `refs/tags/${tag}`,
    `refs/tags/${tag}${PEELED_SUFFIX}`,
  ])

  if (output === null) {
    return null
  }

  return parseLsRemote(output, 'refs/tags/').get(tag) ?? null
}

export async function remoteTagExists(
  git: GitCommand,
  remote: string,
  tag: string,
): Promise<boolean> {
  return (await resolveRemoteTag(git, remote, tag)) !== null
}

export async function readRemoteBranchSha(
  git: GitCommand,
  remote: string,
  branch: string,
): Promise<string | null> {
  const output = await git.readText(['ls-remote', remote, `refs/heads/${branch}`])

  if (output === null) {
    return null
  }

  return parseLsRemote(output, 'refs/heads/').get(branch) ?? null
}

export async function isAncestor(
  git: GitCommand,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const result = await git.run(['merge-base', '--is-ancestor', ancestor, descendant])
  return result.exitCode === 0
}

export async function headExistsOnRemote(
  git: GitCommand,
  remote: string,
  branch: string,
  headSha: string,
): Promise<boolean> {
  const remoteSha = await readRemoteBranchSha(git, remote, branch)

  if (remoteSha === null) {
    return false
  }

  if (remoteSha === headSha) {
    return true
  }

  return isAncestor(git, headSha, remoteSha)
}

function toReleaseTag(tag: GitTagRef, tagPrefix: string): ReleaseTag | null {
  if (!tag.name.startsWith(tagPrefix)) {
    return null
  }

  const version = semver.valid(tag.name.slice(tagPrefix.length))

  if (version === null) {
    return null
  }

  return { ref: tag.name, sha: tag.commitSha, version }
}

/**
 * Resolves the release a new one follows: the highest SemVer tag carrying the
 * configured prefix that is also an ancestor of `HEAD`. Highest-alone is wrong
 * on a maintenance branch, where a newer tag exists on another line of history
 * and would produce a commit range spanning unrelated work.
 */
export async function findPreviousRelease(
  git: GitCommand,
  tagPrefix: string,
): Promise<ReleaseTag | null> {
  const tags = await listLocalTags(git)
  const candidates = tags
    .flatMap((tag) => {
      const release = toReleaseTag(tag, tagPrefix)
      return release === null ? [] : [release]
    })
    .toSorted((left, right) => semver.rcompare(left.version, right.version))

  const ancestry = await Promise.all(
    candidates.map((candidate) => isAncestor(git, candidate.sha, 'HEAD')),
  )

  return candidates.find((_, index) => ancestry[index] === true) ?? null
}
