import { describe, expect, it } from 'vitest'
import { MalformedValue } from '../../src/domain/errors.js'
import {
  AbsolutePath,
  Digest,
  DistTagName,
  Iso8601,
  PackageName,
  RepoRelativePath,
  SemVer,
  Sha,
  TagName,
} from '../../src/domain/semantic.js'

describe('Sha', () => {
  it('accepts what Git prints and rejects what it never would', () => {
    expect(Sha.is('a'.repeat(40))).toBe(true)
    expect(Sha.is('a'.repeat(64))).toBe(true)
    expect(Sha.is('abc1234')).toBe(true)
    expect(Sha.is('abc12')).toBe(false)
    expect(Sha.is('v1.2.3')).toBe(false)
    expect(Sha.is('A'.repeat(40))).toBe(false)
  })

  it('names the value and its origin when construction fails', () => {
    expect(() => Sha.from('v1.2.3', 'git rev-parse HEAD')).toThrow(MalformedValue)
    expect(() => Sha.from('v1.2.3', 'git rev-parse HEAD')).toThrow(/git rev-parse HEAD/)
  })

  it('parses to null rather than throwing when asked to', () => {
    expect(Sha.parse('nope')).toBeNull()
    expect(Sha.parse('a'.repeat(40))).toBe('a'.repeat(40))
  })
})

describe('SemVer', () => {
  it('accepts only the canonical form', () => {
    expect(SemVer.is('1.2.3')).toBe(true)
    expect(SemVer.is('1.3.0-beta.0')).toBe(true)
    expect(SemVer.is('v1.2.3')).toBe(false)
    expect(SemVer.is('1.2')).toBe(false)
    expect(SemVer.is('')).toBe(false)
  })
})

describe('DistTagName', () => {
  it('rejects a tag npm would read as a version', () => {
    expect(DistTagName.is('latest')).toBe(true)
    expect(DistTagName.is('beta')).toBe(true)
    expect(DistTagName.is('1.2.3')).toBe(false)
    expect(DistTagName.is('two words')).toBe(false)
  })
})

describe('RepoRelativePath', () => {
  it('refuses paths that escape the repository', () => {
    expect(RepoRelativePath.is('package.json')).toBe(true)
    expect(RepoRelativePath.is('docs/readme.md')).toBe(true)
    expect(RepoRelativePath.is('../outside.txt')).toBe(false)
    expect(RepoRelativePath.is('docs/../../outside.txt')).toBe(false)
    expect(RepoRelativePath.is('/etc/passwd')).toBe(false)
    expect(RepoRelativePath.is('')).toBe(false)
  })
})

describe('AbsolutePath', () => {
  it('accepts POSIX and Windows roots', () => {
    expect(AbsolutePath.is('/tmp/repo')).toBe(true)
    expect(AbsolutePath.is(String.raw`C:\repo`)).toBe(true)
    expect(AbsolutePath.is('repo')).toBe(false)
  })
})

describe('PackageName', () => {
  it('follows npm naming rules', () => {
    expect(PackageName.is('releaser')).toBe(true)
    expect(PackageName.is('@remcostoeten/releaser')).toBe(true)
    expect(PackageName.is('Releaser')).toBe(false)
    expect(PackageName.is('a'.repeat(215))).toBe(false)
  })
})

describe('TagName', () => {
  it('rejects the ref syntax Git forbids', () => {
    expect(TagName.is('v1.2.3')).toBe(true)
    expect(TagName.is('release/v1.2.3')).toBe(true)
    expect(TagName.is('v1..2')).toBe(false)
    expect(TagName.is('v1.2.3^')).toBe(false)
    expect(TagName.is('has space')).toBe(false)
  })
})

describe('Digest and Iso8601', () => {
  it('accept exactly the shapes they describe', () => {
    expect(Digest.is('0'.repeat(64))).toBe(true)
    expect(Digest.is('0'.repeat(40))).toBe(false)
    expect(Iso8601.is('2026-01-01T00:00:00.000Z')).toBe(true)
    expect(Iso8601.is('2024-01-01T00:00:00+00:00')).toBe(true)
    expect(Iso8601.is('2026-01-01')).toBe(false)
  })
})
