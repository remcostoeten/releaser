import type { ReleaserConfig } from '../config/schema.js'
import type { GitHubReleaseAction, NpmPublishAction } from '../domain/actions.js'
import type { ReleaseBoundary } from '../domain/repository.js'
import type { Sha, TagName } from '../domain/semantic.js'
import { distTagName, type ReleaseVersion } from '../domain/version.js'
import type {
  GitHubRepositoryRef,
  GitHubTokenStatus,
  PackageManifest,
  PreviousRelease,
} from './ports.js'

export function buildBoundary(headSha: Sha, previous: PreviousRelease | null): ReleaseBoundary {
  if (previous === null) {
    return { kind: 'initial', headSha }
  }

  return {
    kind: 'since-release',
    previousRef: previous.ref,
    previousSha: previous.sha,
    previousVersion: previous.version,
    headSha,
  }
}

export function buildNpmPublishAction(
  config: ReleaserConfig,
  manifest: PackageManifest,
  version: ReleaseVersion,
): NpmPublishAction {
  if (!config.npm.publish) {
    return { kind: 'skipped', reason: 'npm.publish is disabled in configuration' }
  }

  if (manifest.private) {
    return { kind: 'skipped', reason: 'package.json marks the package as private' }
  }

  return {
    kind: 'publish',
    packageName: manifest.name,
    version: version.nextVersion,
    distTag: distTagName(version.distTag),
    access: config.npm.access,
  }
}

export function buildGitHubReleaseAction(input: {
  config: ReleaserConfig
  tokenStatus: GitHubTokenStatus
  githubRef: GitHubRepositoryRef | null
  tagName: TagName
  prerelease: boolean
  body: string
}): GitHubReleaseAction {
  if (!input.config.github.release) {
    return { kind: 'skipped', reason: 'github.release is disabled in configuration' }
  }

  if (input.tokenStatus.kind === 'absent') {
    return { kind: 'skipped', reason: 'No GitHub token available' }
  }

  if (input.tokenStatus.kind === 'invalid') {
    return { kind: 'skipped', reason: `GitHub token rejected: ${input.tokenStatus.reason}` }
  }

  if (input.githubRef === null) {
    return {
      kind: 'skipped',
      reason: `Remote ${input.config.remote} does not point at a GitHub repository`,
    }
  }

  return {
    kind: 'create',
    owner: input.githubRef.owner,
    repo: input.githubRef.repo,
    tagName: input.tagName,
    name: input.tagName,
    body: input.body,
    draft: input.config.github.draft,
    prerelease: input.prerelease,
  }
}
