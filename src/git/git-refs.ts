import semver from 'semver'
import { parseVersion } from '../domain/version.js'
import { Ref, type Revision, type SemVer, Sha, TagName } from '../domain/semantic.js'
import { type GitCommand, splitLines } from './git-command.js'

export type GitTagRef = {
  name: TagName
  commitSha: Sha
}

export type ReleaseTag = {
  ref: TagName
  sha: Sha
  version: SemVer
}

const PEELED_SUFFIX = '^{}'
const HEAD_REF = Ref.from('HEAD', 'the built-in HEAD ref')

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

    return [
      {
        name: TagName.from(name, 'git for-each-ref refs/tags'),
        commitSha: Sha.from(commitSha, 'git for-each-ref refs/tags'),
      },
    ]
  })
}

export async function resolveLocalTag(git: GitCommand, tag: string): Promise<Sha | null> {
  const sha = await git.readText(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`])
  return sha === null || sha.length === 0 ? null : Sha.from(sha, `git rev-parse refs/tags/${tag}`)
}

export async function localTagExists(git: GitCommand, tag: string): Promise<boolean> {
  return (await resolveLocalTag(git, tag)) !== null
}

function parseLsRemote(output: string, refPrefix: string): Map<string, Sha> {
  const shaByName = new Map<string, Sha>()

  for (const line of splitLines(output)) {
    const [sha, ref] = line.split(/\s+/)

    if (sha === undefined || ref === undefined || !ref.startsWith(refPrefix)) {
      continue
    }

    const name = ref.slice(refPrefix.length)

    const objectSha = Sha.from(sha, 'git ls-remote')

    if (name.endsWith(PEELED_SUFFIX)) {
      shaByName.set(name.slice(0, -PEELED_SUFFIX.length), objectSha)
      continue
    }

    if (!shaByName.has(name)) {
      shaByName.set(name, objectSha)
    }
  }

  return shaByName
}

export async function listRemoteTags(git: GitCommand, remote: string): Promise<GitTagRef[]> {
  const output = await git.readText(['ls-remote', '--tags', remote])

  if (output === null) {
    return []
  }

  return [...parseLsRemote(output, 'refs/tags/')].map(([name, commitSha]) => ({
    name: TagName.from(name, 'git ls-remote --tags'),
    commitSha,
  }))
}

export async function resolveRemoteTag(
  git: GitCommand,
  remote: string,
  tag: string,
): Promise<Sha | null> {
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
): Promise<Sha | null> {
  const output = await git.readText(['ls-remote', remote, `refs/heads/${branch}`])

  if (output === null) {
    return null
  }

  return parseLsRemote(output, 'refs/heads/').get(branch) ?? null
}

export async function isAncestor(
  git: GitCommand,
  ancestor: Revision,
  descendant: Revision,
): Promise<boolean> {
  const result = await git.run(['merge-base', '--is-ancestor', ancestor, descendant])
  return result.exitCode === 0
}

export async function headExistsOnRemote(
  git: GitCommand,
  remote: string,
  branch: string,
  headSha: Sha,
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

  const candidate = tag.name.slice(tagPrefix.length)

  if (semver.valid(candidate) === null) {
    return null
  }

  return { ref: tag.name, sha: tag.commitSha, version: parseVersion(candidate, 'the tag version') }
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
    candidates.map((candidate) => isAncestor(git, candidate.sha, HEAD_REF)),
  )

  return candidates.find((_, index) => ancestry[index] === true) ?? null
}
