import { describe, expect, it } from 'vitest'
import {
  compareFingerprints,
  fingerprintRepository,
  fingerprintsMatch,
  type FingerprintField,
  type RepositoryFingerprint,
} from '../../src/domain/repository.js'
import { cleanRepositoryState } from '../helpers/recording-ports.js'
import { digest, sha, version } from '../helpers/semantic.js'

const baseline: RepositoryFingerprint = {
  headSha: sha('a'.repeat(40)),
  statusDigest: digest('0'.repeat(64)),
  manifestVersion: version('1.2.3'),
  upstreamSha: sha('b'.repeat(40)),
}

const CHANGED: RepositoryFingerprint = {
  headSha: sha('c'.repeat(40)),
  statusDigest: digest('1'.repeat(64)),
  manifestVersion: version('1.2.4'),
  upstreamSha: sha('d'.repeat(40)),
}

describe('fingerprintRepository', () => {
  it('captures all four fields from the repository state', () => {
    expect(fingerprintRepository(cleanRepositoryState(), version('1.2.3'))).toEqual({
      headSha: sha('a'.repeat(40)),
      statusDigest: digest('0'.repeat(64)),
      manifestVersion: version('1.2.3'),
      upstreamSha: sha('a'.repeat(40)),
    })
  })

  it('records a null upstream when the branch has none', () => {
    const state = cleanRepositoryState()
    const detached = {
      ...state,
      head: { kind: 'detached' as const, sha: sha('a'.repeat(40)) },
    }

    expect(fingerprintRepository(detached, version('1.2.3')).upstreamSha).toBe(null)
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
