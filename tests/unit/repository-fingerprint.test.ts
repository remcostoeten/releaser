import { describe, expect, it } from 'vitest'
import {
  compareFingerprints,
  fingerprintRepository,
  fingerprintsMatch,
  type FingerprintField,
  type RepositoryFingerprint,
} from '../../src/domain/repository.js'
import { cleanRepositoryState } from '../helpers/recording-ports.js'

const baseline: RepositoryFingerprint = {
  headSha: 'a'.repeat(40),
  statusDigest: 'digest-clean',
  manifestVersion: '1.2.3',
  upstreamSha: 'b'.repeat(40),
}

const CHANGED: Record<FingerprintField, string> = {
  headSha: 'c'.repeat(40),
  statusDigest: 'digest-dirty',
  manifestVersion: '1.2.4',
  upstreamSha: 'd'.repeat(40),
}

describe('fingerprintRepository', () => {
  it('captures all four fields from the repository state', () => {
    expect(fingerprintRepository(cleanRepositoryState(), '1.2.3')).toEqual({
      headSha: 'a'.repeat(40),
      statusDigest: 'digest-clean',
      manifestVersion: '1.2.3',
      upstreamSha: 'a'.repeat(40),
    })
  })

  it('records a null upstream when the branch has none', () => {
    const state = cleanRepositoryState()
    const detached = {
      ...state,
      head: { kind: 'detached' as const, sha: 'a'.repeat(40) },
    }

    expect(fingerprintRepository(detached, '1.2.3').upstreamSha).toBe(null)
  })
})

describe('compareFingerprints', () => {
  it('reports no mismatch for identical fingerprints', () => {
    expect(compareFingerprints(baseline, { ...baseline })).toEqual([])
    expect(fingerprintsMatch(baseline, { ...baseline })).toBe(true)
  })

  for (const field of Object.keys(CHANGED) as FingerprintField[]) {
    it(`detects a change to ${field}`, () => {
      const actual: RepositoryFingerprint = { ...baseline, [field]: CHANGED[field] }
      const mismatches = compareFingerprints(baseline, actual)

      expect(mismatches).toEqual([{ field, expected: baseline[field], actual: CHANGED[field] }])
      expect(fingerprintsMatch(baseline, actual)).toBe(false)
    })
  }

  it('detects an upstream that disappeared', () => {
    const mismatches = compareFingerprints(baseline, { ...baseline, upstreamSha: null })

    expect(mismatches).toEqual([
      { field: 'upstreamSha', expected: baseline.upstreamSha, actual: null },
    ])
  })

  it('reports every changed field at once', () => {
    const mismatches = compareFingerprints(baseline, {
      headSha: CHANGED.headSha,
      statusDigest: CHANGED.statusDigest,
      manifestVersion: CHANGED.manifestVersion,
      upstreamSha: CHANGED.upstreamSha,
    })

    expect(mismatches.map((mismatch) => mismatch.field)).toEqual([
      'headSha',
      'statusDigest',
      'manifestVersion',
      'upstreamSha',
    ])
  })
})
