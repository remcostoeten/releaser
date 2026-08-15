import type { CommitSummary } from '../domain/changes.js'
import {
  fingerprintRepository,
  type RepositoryFingerprint,
  type RepositoryState,
} from '../domain/repository.js'
import type { CommandRunner } from '../shared/command-runner.js'
import { createGitCommand, type GitCommand } from './git-command.js'
import type { CommitRange } from './git-history.js'
import { readChangedFiles, readCommits } from './git-history.js'
import {
  findPreviousRelease,
  headExistsOnRemote,
  listLocalTags,
  listRemoteTags,
  localTagExists,
  type GitTagRef,
  type ReleaseTag,
  remoteTagExists,
  resolveLocalTag,
  readRemoteBranchSha,
  resolveRemoteTag,
} from './git-refs.js'
import {
  locateRepository,
  readDefaultBranch,
  readHead,
  readRemotes,
  readRemoteUrl,
  readStatusDigest,
  readWorkingTree,
  type GitRepositoryLocation,
} from './git-status.js'
import { parseRemoteUrl, type RemoteRepository } from './remote-url.js'

export type GitStateLookup =
  | { kind: 'found'; state: RepositoryState }
  | { kind: 'no-commits'; root: string }
  | { kind: 'not-a-repository'; path: string }

export type GitReaderOptions = {
  cwd: string
  remote: string
}

export type GitReader = {
  command: GitCommand
  locate(): Promise<GitRepositoryLocation>
  readState(): Promise<GitStateLookup>
  readFingerprint(manifestVersion: string): Promise<RepositoryFingerprint>
  readRemoteRepository(): Promise<RemoteRepository | null>
  listLocalTags(): Promise<GitTagRef[]>
  listRemoteTags(): Promise<GitTagRef[]>
  localTagExists(tag: string): Promise<boolean>
  remoteTagExists(tag: string): Promise<boolean>
  resolveLocalTag(tag: string): Promise<string | null>
  resolveRemoteTag(tag: string): Promise<string | null>
  readRemoteBranchSha(branch: string): Promise<string | null>
  headExistsOnRemote(branch: string, headSha: string): Promise<boolean>
  findPreviousRelease(tagPrefix: string): Promise<ReleaseTag | null>
  readCommits(range: CommitRange): Promise<CommitSummary[]>
  readChangedFiles(range: CommitRange): Promise<string[]>
}

async function readRepositoryState(git: GitCommand, remote: string): Promise<RepositoryState> {
  const location = await locateRepository(git, git.cwd)
  const root = location.kind === 'not-a-repository' ? git.cwd : location.root

  return {
    root,
    head: await readHead(git),
    workingTree: await readWorkingTree(git),
    statusDigest: await readStatusDigest(git),
    remotes: await readRemotes(git),
    defaultBranch: await readDefaultBranch(git, remote),
  }
}

/**
 * The read half of the Git module. Every method returns domain types — raw
 * stdout never leaves this directory — and none of them mutates the
 * repository, so planning can call any of them freely.
 */
export function createGitReader(runner: CommandRunner, options: GitReaderOptions): GitReader {
  const git = createGitCommand(runner, options.cwd)
  const { remote } = options

  async function readState(): Promise<GitStateLookup> {
    const location = await locateRepository(git, git.cwd)

    if (location.kind !== 'found') {
      return location
    }

    return { kind: 'found', state: await readRepositoryState(git, remote) }
  }

  return {
    command: git,
    locate: () => locateRepository(git, git.cwd),
    readState,
    async readFingerprint(manifestVersion): Promise<RepositoryFingerprint> {
      return fingerprintRepository(await readRepositoryState(git, remote), manifestVersion)
    },
    async readRemoteRepository(): Promise<RemoteRepository | null> {
      const url = await readRemoteUrl(git, remote)
      return url === null ? null : parseRemoteUrl(url)
    },
    listLocalTags: () => listLocalTags(git),
    listRemoteTags: () => listRemoteTags(git, remote),
    localTagExists: (tag) => localTagExists(git, tag),
    remoteTagExists: (tag) => remoteTagExists(git, remote, tag),
    resolveLocalTag: (tag) => resolveLocalTag(git, tag),
    resolveRemoteTag: (tag) => resolveRemoteTag(git, remote, tag),
    readRemoteBranchSha: (branch) => readRemoteBranchSha(git, remote, branch),
    headExistsOnRemote: (branch, headSha) => headExistsOnRemote(git, remote, branch, headSha),
    findPreviousRelease: (tagPrefix) => findPreviousRelease(git, tagPrefix),
    readCommits: (range) => readCommits(git, range),
    readChangedFiles: (range) => readChangedFiles(git, range),
  }
}
