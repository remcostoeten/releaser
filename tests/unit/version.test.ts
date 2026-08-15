import { describe, expect, it } from 'vitest'
import { InvalidVersion, VersionNotIncreasing } from '../../src/domain/errors.js'
import {
  bumpVersion,
  compareVersions,
  derivePrereleaseTag,
  highestVersion,
  isPrerelease,
  isValidVersion,
  resolveDistTag,
  resolveReleaseVersion,
} from '../../src/domain/version.js'

describe('bumpVersion', () => {
  it('bumps patch, minor, and major', () => {
    expect(bumpVersion('1.2.3', { kind: 'bump', bump: 'patch' })).toBe('1.2.4')
    expect(bumpVersion('1.2.3', { kind: 'bump', bump: 'minor' })).toBe('1.3.0')
    expect(bumpVersion('1.2.3', { kind: 'bump', bump: 'major' })).toBe('2.0.0')
  })

  it('bumps a prerelease with an identifier', () => {
    expect(bumpVersion('1.2.3', { kind: 'prerelease', identifier: 'beta' })).toBe('1.2.4-beta.0')
    expect(bumpVersion('1.2.4-beta.0', { kind: 'prerelease', identifier: 'beta' })).toBe(
      '1.2.4-beta.1',
    )
  })

  it('bumps a prerelease without an identifier', () => {
    expect(bumpVersion('1.2.3', { kind: 'prerelease', identifier: null })).toBe('1.2.4-0')
  })

  it('accepts an explicit custom version', () => {
    expect(bumpVersion('1.2.3', { kind: 'custom', version: '2.0.0-rc.1' })).toBe('2.0.0-rc.1')
  })

  it('rejects invalid SemVer on either side', () => {
    expect(() => bumpVersion('not-a-version', { kind: 'bump', bump: 'patch' })).toThrow(
      InvalidVersion,
    )
    expect(() => bumpVersion('1.2.3', { kind: 'custom', version: 'v1.2' })).toThrow(InvalidVersion)
  })
})

describe('version predicates', () => {
  it('validates and compares', () => {
    expect(isValidVersion('1.2.3')).toBe(true)
    expect(isValidVersion('1.2')).toBe(false)
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(-1)
  })

  it('recognizes prereleases', () => {
    expect(isPrerelease('1.2.3')).toBe(false)
    expect(isPrerelease('1.2.3-beta.1')).toBe(true)
  })

  it('finds the highest published version, ignoring unparseable entries', () => {
    expect(highestVersion(['1.0.0', '2.1.0', '1.9.9', 'garbage'])).toBe('2.1.0')
    expect(highestVersion([])).toBe(null)
  })
})

describe('dist-tag derivation', () => {
  it('uses latest for a stable version', () => {
    expect(resolveDistTag('1.2.3', null)).toEqual({ kind: 'latest' })
  })

  it('derives the tag from the prerelease identifier', () => {
    expect(derivePrereleaseTag('1.2.0-beta.1')).toEqual({ tag: 'beta', source: 'identifier' })
    expect(resolveDistTag('1.2.0-beta.1', null)).toEqual({
      kind: 'prerelease',
      tag: 'beta',
      source: 'identifier',
    })
  })

  it('falls back to next when the identifier is numeric or absent', () => {
    expect(resolveDistTag('1.2.0-0', null)).toEqual({
      kind: 'prerelease',
      tag: 'next',
      source: 'fallback',
    })
  })

  it('lets an explicit tag win', () => {
    expect(resolveDistTag('1.2.0-beta.1', 'canary')).toEqual({ kind: 'explicit', tag: 'canary' })
  })

  it('refuses to publish a prerelease to latest', () => {
    expect(() => resolveDistTag('1.2.0-beta.1', 'latest')).toThrow(InvalidVersion)
  })
})

describe('resolveReleaseVersion', () => {
  it('rejects a custom version equal to the current one', () => {
    expect(() =>
      resolveReleaseVersion({
        manifestVersion: '1.2.3',
        highestPublishedVersion: '1.2.3',
        selection: { kind: 'custom', version: '1.2.3' },
        explicitDistTag: null,
      }),
    ).toThrow(VersionNotIncreasing)
  })

  it('rejects a custom version below the current one', () => {
    expect(() =>
      resolveReleaseVersion({
        manifestVersion: '1.2.3',
        highestPublishedVersion: null,
        selection: { kind: 'custom', version: '1.2.2' },
        explicitDistTag: null,
      }),
    ).toThrow(VersionNotIncreasing)
  })

  it('rejects a version above the manifest but not above the registry', () => {
    expect(() =>
      resolveReleaseVersion({
        manifestVersion: '1.2.3',
        highestPublishedVersion: '2.0.0',
        selection: { kind: 'custom', version: '1.3.0' },
        explicitDistTag: null,
      }),
    ).toThrow(VersionNotIncreasing)
  })

  it('constrains an unpublished package by the manifest alone', () => {
    const version = resolveReleaseVersion({
      manifestVersion: '0.1.0',
      highestPublishedVersion: null,
      selection: { kind: 'bump', bump: 'minor' },
      explicitDistTag: null,
    })

    expect(version).toEqual({
      previousVersion: '0.1.0',
      nextVersion: '0.2.0',
      selection: { kind: 'bump', bump: 'minor' },
      distTag: { kind: 'latest' },
      prerelease: false,
    })
  })

  it('increments from the registry when it has moved ahead of the manifest', () => {
    const version = resolveReleaseVersion({
      manifestVersion: '1.2.3',
      highestPublishedVersion: '1.4.0',
      selection: { kind: 'bump', bump: 'patch' },
      explicitDistTag: null,
    })

    expect(version.nextVersion).toBe('1.4.1')
    expect(version.previousVersion).toBe('1.2.3')
  })

  it('carries the derived dist-tag for a prerelease', () => {
    const version = resolveReleaseVersion({
      manifestVersion: '1.2.3',
      highestPublishedVersion: '1.2.3',
      selection: { kind: 'prerelease', identifier: 'rc' },
      explicitDistTag: null,
    })

    expect(version.nextVersion).toBe('1.2.4-rc.0')
    expect(version.prerelease).toBe(true)
    expect(version.distTag).toEqual({ kind: 'prerelease', tag: 'rc', source: 'identifier' })
  })

  it('rejects an invalid manifest version before anything else', () => {
    expect(() =>
      resolveReleaseVersion({
        manifestVersion: '1.2',
        highestPublishedVersion: null,
        selection: { kind: 'bump', bump: 'patch' },
        explicitDistTag: null,
      }),
    ).toThrow(InvalidVersion)
  })
})
