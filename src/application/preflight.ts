import type { ReleaserConfig } from '../config/schema.js'
import {
  checkBlocked,
  checkPassed,
  checkSkipped,
  checkWarned,
  type ReleaseCheck,
} from '../domain/checks.js'
import type { RepositoryState, UpstreamState } from '../domain/repository.js'
import { BranchName } from '../domain/semantic.js'
import { meetsMinimum } from '../domain/version.js'
import type { GitHubTokenStatus, NpmAuthentication } from './ports.js'

const MINIMUM_GIT_VERSION = '2.30.0'

export function resolveReleaseBranch(
  config: ReleaserConfig,
  state: RepositoryState,
): BranchName | null {
  if (config.releaseBranch !== null) {
    return BranchName.from(config.releaseBranch, 'the configured release branch')
  }

  if (state.defaultBranch !== null) {
    return state.defaultBranch
  }

  return state.head.kind === 'branch' ? state.head.branch : null
}

export function toolchainChecks(
  gitVersion: string | null,
  npmVersion: string | null,
): ReleaseCheck[] {
  const gitTitle = 'git executable present'

  const git =
    gitVersion === null
      ? checkBlocked(
          'git-available',
          gitTitle,
          'git was not found on PATH',
          `Install Git ${MINIMUM_GIT_VERSION} or newer.`,
          false,
        )
      : meetsMinimum(gitVersion, MINIMUM_GIT_VERSION)
        ? checkPassed('git-available', gitTitle)
        : checkBlocked(
            'git-available',
            gitTitle,
            `git ${gitVersion} is older than ${MINIMUM_GIT_VERSION}`,
            `Upgrade Git to ${MINIMUM_GIT_VERSION} or newer.`,
            false,
          )

  const npm =
    npmVersion === null
      ? checkBlocked(
          'npm-available',
          'npm executable present',
          'npm was not found on PATH',
          'Install npm.',
          false,
        )
      : checkPassed('npm-available', 'npm executable present')

  return [git, npm]
}

export function notARepositoryCheck(path: string): ReleaseCheck {
  return checkBlocked(
    'inside-git-repository',
    'Inside a Git repository',
    `${path} is not inside a Git repository`,
    'Run releaser from within a Git repository.',
    false,
  )
}

function workingTreeCheck(state: RepositoryState): ReleaseCheck {
  if (state.workingTree.kind === 'clean') {
    return checkPassed('working-tree-clean', 'Working tree clean')
  }

  return checkBlocked(
    'working-tree-clean',
    'Working tree clean',
    `${state.workingTree.entries.length} uncommitted change(s)`,
    'Commit or stash your changes before releasing.',
    true,
  )
}

function detachedHeadCheck(state: RepositoryState): ReleaseCheck {
  if (state.head.kind === 'branch') {
    return checkPassed('no-detached-head', 'Not in detached HEAD')
  }

  return checkBlocked(
    'no-detached-head',
    'Not in detached HEAD',
    'HEAD is detached',
    'Check out the branch you intend to release from.',
    true,
  )
}

function remoteCheck(config: ReleaserConfig, state: RepositoryState): ReleaseCheck {
  const title = `Remote ${config.remote} configured`

  if (state.remotes.includes(config.remote)) {
    return checkPassed('remote-configured', title)
  }

  return checkBlocked(
    'remote-configured',
    title,
    `No remote named ${config.remote}`,
    `Add the remote with \`git remote add ${config.remote} <url>\`.`,
    false,
  )
}

function trackedUpstreamChecks(
  upstream: Extract<UpstreamState, { kind: 'tracked' }>,
): ReleaseCheck[] {
  const behind =
    upstream.behind === 0
      ? checkPassed('not-behind-upstream', 'Branch not behind upstream')
      : checkBlocked(
          'not-behind-upstream',
          'Branch not behind upstream',
          `Behind ${upstream.ref} by ${upstream.behind} commit(s)`,
          'Pull the latest changes before releasing.',
          false,
        )

  const diverged =
    upstream.ahead === 0 || upstream.behind === 0
      ? checkPassed('not-diverged-from-upstream', 'Branch not diverged from upstream')
      : checkBlocked(
          'not-diverged-from-upstream',
          'Branch not diverged from upstream',
          `Diverged from ${upstream.ref} by ${upstream.ahead} ahead / ${upstream.behind} behind`,
          'Rebase or merge before releasing.',
          false,
        )

  return [checkPassed('upstream-configured', 'Branch has an upstream'), behind, diverged]
}

function upstreamChecks(
  config: ReleaserConfig,
  branch: string,
  upstream: UpstreamState,
): ReleaseCheck[] {
  if (upstream.kind === 'tracked') {
    return trackedUpstreamChecks(upstream)
  }

  const reason = 'Branch has no upstream'
  return [
    checkBlocked(
      'upstream-configured',
      'Branch has an upstream',
      reason,
      `Set one with \`git branch --set-upstream-to ${config.remote}/${branch}\`.`,
      true,
    ),
    checkSkipped('not-behind-upstream', 'Branch not behind upstream', reason),
    checkSkipped('not-diverged-from-upstream', 'Branch not diverged from upstream', reason),
  ]
}

function releaseBranchCheck(
  config: ReleaserConfig,
  state: RepositoryState,
  branch: string,
): ReleaseCheck {
  const releaseBranch = resolveReleaseBranch(config, state)

  if (releaseBranch === null || releaseBranch === branch) {
    return checkPassed('on-release-branch', 'On the release branch')
  }

  return checkWarned(
    'on-release-branch',
    'On the release branch',
    `Releasing from ${branch} rather than ${releaseBranch}`,
    `Check out ${releaseBranch}, or accept this branch deliberately.`,
  )
}

export function repositoryChecks(config: ReleaserConfig, state: RepositoryState): ReleaseCheck[] {
  const common = [workingTreeCheck(state), detachedHeadCheck(state), remoteCheck(config, state)]

  if (state.head.kind === 'detached') {
    const reason = 'HEAD is detached'
    return [
      ...common,
      checkSkipped('upstream-configured', 'Branch has an upstream', reason),
      checkSkipped('not-behind-upstream', 'Branch not behind upstream', reason),
      checkSkipped('not-diverged-from-upstream', 'Branch not diverged from upstream', reason),
      checkSkipped('on-release-branch', 'On the release branch', reason),
    ]
  }

  return [
    ...common,
    ...upstreamChecks(config, state.head.branch, state.head.upstream),
    releaseBranchCheck(config, state, state.head.branch),
  ]
}

export function manifestUnreadableCheck(path: string, reason: string): ReleaseCheck {
  return checkBlocked(
    'manifest-valid',
    'package.json readable and valid',
    `${path}: ${reason}`,
    'Fix package.json before releasing.',
    false,
  )
}

export function manifestChecks(isPrivate: boolean): ReleaseCheck[] {
  const privateCheck = isPrivate
    ? checkBlocked(
        'package-not-private',
        'Package not private',
        'package.json sets private: true',
        'Remove "private": true, or disable npm publishing in configuration.',
        false,
      )
    : checkPassed('package-not-private', 'Package not private')

  return [checkPassed('manifest-valid', 'package.json readable and valid'), privateCheck]
}

export function npmAuthenticationCheck(authentication: NpmAuthentication): ReleaseCheck {
  const title = 'npm authentication resolves to a user'

  if (authentication.kind === 'authenticated') {
    return checkPassed('npm-authenticated', title)
  }

  return checkBlocked(
    'npm-authenticated',
    title,
    'npm whoami did not resolve to a user',
    'Run `npm login`, or set an automation token.',
    false,
  )
}

export function versionNotPublishedCheck(
  packageName: string,
  version: string,
  publishedVersions: readonly string[],
): ReleaseCheck {
  const title = 'Target version not already published'

  if (!publishedVersions.includes(version)) {
    return checkPassed('version-not-published', title)
  }

  return checkBlocked(
    'version-not-published',
    title,
    `${packageName}@${version} is already on the registry`,
    'Choose a different version.',
    false,
  )
}

export function tagAvailableCheck(
  tagName: string,
  localExists: boolean,
  remoteExists: boolean,
): ReleaseCheck {
  const title = 'Target tag does not already exist'

  if (!localExists && !remoteExists) {
    return checkPassed('tag-available', title)
  }

  const location =
    localExists && remoteExists
      ? 'locally and on the remote'
      : localExists
        ? 'locally'
        : 'on the remote'

  return checkBlocked(
    'tag-available',
    title,
    `Tag ${tagName} already exists ${location}`,
    'Delete the tag, or choose a different version.',
    false,
  )
}

export function githubChecks(
  config: ReleaserConfig,
  tokenStatus: GitHubTokenStatus,
): ReleaseCheck[] {
  const validTitle = 'GitHub token present and valid'
  const writeTitle = 'GitHub token can write to the repository'

  if (!config.github.release) {
    const reason = 'GitHub releases are disabled'
    return [
      checkSkipped('github-token-valid', validTitle, reason),
      checkSkipped('github-token-can-write', writeTitle, reason),
    ]
  }

  if (tokenStatus.kind !== 'valid') {
    return [
      checkBlocked(
        'github-token-valid',
        validTitle,
        tokenStatus.kind === 'absent' ? 'No GitHub token was found' : tokenStatus.reason,
        'Set GITHUB_TOKEN, or override to skip the GitHub Release stage.',
        true,
      ),
      checkSkipped('github-token-can-write', writeTitle, 'No usable GitHub token'),
    ]
  }

  return [
    checkPassed('github-token-valid', validTitle),
    tokenStatus.canWrite
      ? checkPassed('github-token-can-write', writeTitle)
      : checkWarned(
          'github-token-can-write',
          writeTitle,
          `${tokenStatus.login} lacks contents: write on this repository`,
          'Use a token with contents: write, or skip the GitHub Release stage.',
        ),
  ]
}

export function replacementMismatchCheck(
  file: string,
  expectedMatches: number,
  actualMatches: number,
): ReleaseCheck {
  return checkBlocked(
    'replacements-match',
    'Configured replacements match expectedMatches',
    `${file} matched ${actualMatches} time(s), expected ${expectedMatches}`,
    'Fix the replacement pattern or its expectedMatches count.',
    false,
  )
}

export function replacementsMatchCheck(): ReleaseCheck {
  return checkPassed('replacements-match', 'Configured replacements match expectedMatches')
}
