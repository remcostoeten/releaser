import type { ReleaserConfig } from '../config/schema.js'
import { checkPassed, type ReleaseCheck } from '../domain/checks.js'
import { mutatedPaths } from '../domain/mutations.js'
import { createReleasePlan as buildReleasePlan, type ReleasePlan } from '../domain/release-plan.js'
import { fingerprintRepository, type RepositoryState } from '../domain/repository.js'
import { BranchName, TagName } from '../domain/semantic.js'
import {
  highestVersion,
  resolveReleaseVersion,
  versionParts,
  type ReleaseVersion,
  type VersionSelection,
} from '../domain/version.js'
import type {
  GitHubReader,
  ManifestReader,
  MutationPlanner,
  NotesReader,
  PlanClock,
  PlanIdFactory,
  RegistryReader,
  RepositoryReader,
  ToolchainReader,
} from './ports.js'
import {
  githubChecks,
  manifestChecks,
  manifestUnreadableCheck,
  notARepositoryCheck,
  npmAuthenticationCheck,
  npmAuthenticationSkippedCheck,
  replacementMismatchCheck,
  replacementsMatchCheck,
  repositoryChecks,
  resolveReleaseBranch,
  tagAvailableCheck,
  toolchainChecks,
  versionNotPublishedCheck,
  versionNotPublishedSkippedCheck,
} from './preflight.js'
import {
  buildBoundary,
  buildGitHubReleaseAction,
  buildNpmPublishAction,
} from './release-actions.js'
import { renderTemplate } from './render-template.js'
import { renderReleaseNotes } from '../notes/render.js'

export type CreateReleasePlanDependencies = {
  toolchain: ToolchainReader
  repository: RepositoryReader
  manifest: ManifestReader
  registry: RegistryReader
  github: GitHubReader
  mutations: MutationPlanner
  notes: NotesReader
  clock: PlanClock
  ids: PlanIdFactory
}

export type CreateReleasePlanRequest = {
  config: ReleaserConfig
  selection: VersionSelection
  explicitDistTag: string | null
}

export type CreateReleasePlanResult =
  | { kind: 'planned'; plan: ReleasePlan; checks: ReleaseCheck[] }
  | { kind: 'not-planned'; checks: ReleaseCheck[] }

const DETACHED_PUSH_TARGET = BranchName.from('HEAD', 'the detached-HEAD push target')

function pushBranchName(config: ReleaserConfig, state: RepositoryState): BranchName {
  if (state.head.kind === 'branch') {
    return state.head.branch
  }

  return resolveReleaseBranch(config, state) ?? DETACHED_PUSH_TARGET
}

function versionSourceRemediation(config: ReleaserConfig, reason: string): string {
  const looksLikeDefaultSetup =
    config.versionFile === 'package.json' && config.versionPattern === null
  const looksLikeMissingFile = reason.includes('ENOENT')

  if (looksLikeDefaultSetup && looksLikeMissingFile) {
    return (
      'No package.json and no releaser.config.json found. Run `releaser init` to generate a ' +
      'releaser.config.json for this project, or create one by hand with a custom versionFile ' +
      '(and versionPattern for non-JSON sources).'
    )
  }

  return 'Fix the configured version file before releasing.'
}

function templateValuesFor(version: ReleaseVersion): {
  version: string
  previousVersion: string
  major: string
  minor: string
  patch: string
} {
  return {
    version: version.nextVersion,
    previousVersion: version.previousVersion,
    ...versionParts(version.nextVersion),
  }
}

/**
 * Builds a `ReleasePlan` and the preflight results it was judged against.
 *
 * Every dependency is read-only: this function writes no file, no journal
 * entry, and nothing over the network. A blocking check is returned rather
 * than thrown, so the caller decides whether to proceed or override it.
 */
export async function createReleasePlan(
  deps: CreateReleasePlanDependencies,
  request: CreateReleasePlanRequest,
): Promise<CreateReleasePlanResult> {
  const { config } = request
  const [gitVersion, npmVersion] = await Promise.all([
    deps.toolchain.readGitVersion(),
    request.config.npm.publish ? deps.toolchain.readNpmVersion() : Promise.resolve(null),
  ])
  const checks: ReleaseCheck[] = toolchainChecks(gitVersion, npmVersion, request.config.npm.publish)

  const lookup = await deps.repository.readState()

  if (lookup.kind === 'not-a-repository') {
    checks.push(notARepositoryCheck(lookup.path))
    return { kind: 'not-planned', checks }
  }

  const state = lookup.state
  checks.push(
    checkPassed('inside-git-repository', 'Inside a Git repository'),
    ...repositoryChecks(config, state),
  )

  const manifestLookup = await deps.manifest.read()

  if (manifestLookup.kind === 'unreadable') {
    checks.push(
      manifestUnreadableCheck(
        manifestLookup.path,
        manifestLookup.reason,
        versionSourceRemediation(config, manifestLookup.reason),
      ),
    )
    return { kind: 'not-planned', checks }
  }

  const manifest = manifestLookup.manifest
  checks.push(...manifestChecks(manifest.private, config.npm.publish))

  const publishName = config.npm.publish ? manifest.name : null
  const published =
    publishName === null
      ? { kind: 'never-published' as const }
      : await deps.registry.readPublishedVersions(publishName)
  const publishedVersions = published.kind === 'published' ? published.versions : []
  if (config.npm.publish) {
    const authentication = await deps.registry.readAuthentication()
    checks.push(npmAuthenticationCheck(authentication))
  } else {
    checks.push(npmAuthenticationSkippedCheck())
  }

  const version = resolveReleaseVersion({
    manifestVersion: manifest.version,
    highestPublishedVersion: highestVersion(publishedVersions),
    selection: request.selection,
    explicitDistTag: request.explicitDistTag ?? config.npm.tag,
  })

  checks.push(
    publishName === null
      ? versionNotPublishedSkippedCheck()
      : versionNotPublishedCheck(publishName, version.nextVersion, publishedVersions),
  )

  const tagName = TagName.from(
    `${config.tagPrefix}${version.nextVersion}`,
    'the configured tag prefix',
  )
  const [localTag, remoteTag] = await Promise.all([
    deps.repository.localTagExists(tagName),
    deps.repository.remoteTagExists(config.remote, tagName),
  ])
  checks.push(tagAvailableCheck(tagName, localTag, remoteTag))

  const githubRef = config.github.release
    ? await deps.github.resolveRepository(config.remote)
    : null
  const tokenStatus = config.github.release
    ? await deps.github.readTokenStatus(githubRef)
    : { kind: 'absent' as const }
  checks.push(...githubChecks(config, tokenStatus))

  const previousRelease = await deps.repository.findPreviousRelease(config.tagPrefix)
  const boundary = buildBoundary(state.head.sha, previousRelease)

  const mutationOutcome = await deps.mutations.planMutations({
    previousVersion: version.previousVersion,
    nextVersion: version.nextVersion,
  })

  if (mutationOutcome.kind === 'replacement-mismatch') {
    checks.push(
      replacementMismatchCheck(
        mutationOutcome.file,
        mutationOutcome.pattern,
        mutationOutcome.expectedMatches,
        mutationOutcome.actualMatches,
      ),
    )
    return { kind: 'not-planned', checks }
  }

  const fileMutations = mutationOutcome.mutations
  checks.push(replacementsMatchCheck())

  const notes = await deps.notes.collect({
    boundary,
    version: version.nextVersion,
    previousVersion: version.previousVersion,
    githubRepository: githubRef,
    includePullRequests: tokenStatus.kind === 'valid',
  })

  const templateValues = templateValuesFor(version)

  const plan = buildReleasePlan({
    id: deps.ids.next(),
    createdAt: deps.clock.now(),
    repositoryRoot: state.root,
    packageName: manifest.name,
    fingerprint: fingerprintRepository(state, manifest.version),
    boundary,
    version,
    fileMutations,
    commit: {
      message: renderTemplate(config.commitMessage, templateValues),
      paths: mutatedPaths(fileMutations),
    },
    tag: {
      name: tagName,
      message: renderTemplate(config.tagMessage, templateValues),
    },
    pushBranch: {
      remote: config.remote,
      target: { kind: 'branch', branch: pushBranchName(config, state) },
    },
    pushTag: { remote: config.remote, target: { kind: 'tag', tag: tagName } },
    npmPublish: buildNpmPublishAction(config, manifest, version),
    githubRelease: buildGitHubReleaseAction({
      config,
      tokenStatus,
      githubRef,
      tagName,
      prerelease: version.prerelease,
      body: renderReleaseNotes(notes),
    }),
    notes,
  })

  return { kind: 'planned', plan, checks }
}
