import semver from 'semver'
import { InvalidVersion, VersionNotIncreasing } from './errors.js'

export type BumpKind = 'patch' | 'minor' | 'major' | 'prerelease'

export type VersionSelection =
  | { kind: 'bump'; bump: 'patch' | 'minor' | 'major' }
  | { kind: 'prerelease'; identifier: string | null }
  | { kind: 'custom'; version: string }

export type DistTag =
  | { kind: 'latest' }
  | { kind: 'prerelease'; tag: string; source: 'identifier' | 'fallback' }
  | { kind: 'explicit'; tag: string }

export type ReleaseVersion = {
  previousVersion: string
  nextVersion: string
  selection: VersionSelection
  distTag: DistTag
  prerelease: boolean
}

export type ResolveReleaseVersionInput = {
  manifestVersion: string
  highestPublishedVersion: string | null
  selection: VersionSelection
  explicitDistTag: string | null
}

const PRERELEASE_FALLBACK_TAG = 'next'

export function isValidVersion(version: string): boolean {
  return semver.valid(version) !== null
}

export function parseVersion(version: string, label = 'version'): string {
  const parsed = semver.valid(version)

  if (parsed === null) {
    throw new InvalidVersion(version, `${label} is not valid SemVer`)
  }

  return parsed
}

export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  return semver.compare(parseVersion(left), parseVersion(right))
}

export function isStrictlyGreater(candidate: string, other: string): boolean {
  return compareVersions(candidate, other) === 1
}

export function isPrerelease(version: string): boolean {
  const components = semver.prerelease(parseVersion(version))
  return components !== null && components.length > 0
}

export function highestVersion(versions: readonly string[]): string | null {
  const valid = versions.filter((version) => isValidVersion(version))

  if (valid.length === 0) {
    return null
  }

  return valid.reduce((highest, candidate) => (semver.gt(candidate, highest) ? candidate : highest))
}

export function versionParts(version: string): { major: string; minor: string; patch: string } {
  const parsed = new semver.SemVer(parseVersion(version))
  return {
    major: String(parsed.major),
    minor: String(parsed.minor),
    patch: String(parsed.patch),
  }
}

export function meetsMinimum(version: string, minimum: string): boolean {
  const coerced = semver.coerce(version)

  if (coerced === null) {
    return false
  }

  return semver.gte(coerced, parseVersion(minimum, 'minimum version'))
}

export function bumpVersion(current: string, selection: VersionSelection): string {
  const base = parseVersion(current, 'current version')

  if (selection.kind === 'custom') {
    return parseVersion(selection.version, 'custom version')
  }

  const next =
    selection.kind === 'bump'
      ? semver.inc(base, selection.bump)
      : selection.identifier === null
        ? semver.inc(base, 'prerelease')
        : semver.inc(base, 'prerelease', selection.identifier)

  if (next === null) {
    throw new InvalidVersion(current, 'could not be incremented')
  }

  return next
}

export function derivePrereleaseTag(version: string): {
  tag: string
  source: 'identifier' | 'fallback'
} {
  const components = semver.prerelease(parseVersion(version))
  const first = components?.[0]

  if (typeof first === 'string' && first.length > 0) {
    return { tag: first, source: 'identifier' }
  }

  return { tag: PRERELEASE_FALLBACK_TAG, source: 'fallback' }
}

export function resolveDistTag(version: string, explicitDistTag: string | null): DistTag {
  const prerelease = isPrerelease(version)

  if (explicitDistTag !== null) {
    if (prerelease && explicitDistTag === 'latest') {
      throw new InvalidVersion(version, 'a prerelease must not be published to the latest dist-tag')
    }
    return { kind: 'explicit', tag: explicitDistTag }
  }

  if (!prerelease) {
    return { kind: 'latest' }
  }

  const derived = derivePrereleaseTag(version)
  return { kind: 'prerelease', tag: derived.tag, source: derived.source }
}

export function distTagName(distTag: DistTag): string {
  return distTag.kind === 'latest' ? 'latest' : distTag.tag
}

/**
 * Resolves the version a release will publish. The increment is applied to the
 * highest of the manifest and registry versions, so that a registry that has
 * moved ahead of the working tree still yields an acceptable bump — but the
 * result is checked against both, as `SPEC.md` §5 requires.
 */
export function resolveReleaseVersion(input: ResolveReleaseVersionInput): ReleaseVersion {
  const manifestVersion = parseVersion(input.manifestVersion, 'manifest version')
  const publishedVersion =
    input.highestPublishedVersion === null
      ? null
      : parseVersion(input.highestPublishedVersion, 'published version')

  const base =
    publishedVersion !== null && semver.gt(publishedVersion, manifestVersion)
      ? publishedVersion
      : manifestVersion

  const nextVersion = bumpVersion(base, input.selection)

  if (!isStrictlyGreater(nextVersion, manifestVersion)) {
    throw new VersionNotIncreasing(nextVersion, manifestVersion, publishedVersion)
  }

  if (publishedVersion !== null && !isStrictlyGreater(nextVersion, publishedVersion)) {
    throw new VersionNotIncreasing(nextVersion, manifestVersion, publishedVersion)
  }

  return {
    previousVersion: manifestVersion,
    nextVersion,
    selection: input.selection,
    distTag: resolveDistTag(nextVersion, input.explicitDistTag),
    prerelease: isPrerelease(nextVersion),
  }
}
