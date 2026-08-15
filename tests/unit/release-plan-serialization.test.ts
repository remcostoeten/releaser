import { describe, expect, it } from 'vitest'
import { InvalidReleasePlan } from '../../src/domain/errors.js'
import { planStages, serializeReleasePlan } from '../../src/domain/release-plan.js'
import { deserializeReleasePlan, parseReleasePlan } from '../../src/journal/release-plan-schema.js'
import { examplePlan } from '../helpers/plan-fixture.js'

describe('ReleasePlan serialization', () => {
  it('round-trips through JSON losslessly', () => {
    const plan = examplePlan()
    const restored = deserializeReleasePlan(serializeReleasePlan(plan))

    expect(restored).toEqual(plan)
    expect(serializeReleasePlan(restored)).toBe(serializeReleasePlan(plan))
  })

  it('is frozen once created', () => {
    const plan = examplePlan()

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.fingerprint)).toBe(true)
    expect(Object.isFrozen(plan.fileMutations)).toBe(true)
    expect(Object.isFrozen(plan.fileMutations[0])).toBe(true)
  })

  it('derives its stage list from the actions it carries', () => {
    const plan = examplePlan()

    expect(planStages(plan)).toEqual([
      'mutate-files',
      'commit',
      'tag',
      'push-branch',
      'push-tag',
      'npm-publish',
      'github-release',
    ])
  })
})

describe('release plan schema', () => {
  it('accepts a valid plan', () => {
    expect(() => parseReleasePlan(JSON.parse(serializeReleasePlan(examplePlan())))).not.toThrow()
  })

  it('rejects a missing required field', () => {
    const wire = JSON.parse(serializeReleasePlan(examplePlan())) as Record<string, unknown>
    delete wire.fingerprint

    expect(() => parseReleasePlan(wire)).toThrow(InvalidReleasePlan)
  })

  it('rejects a missing fingerprint field — all four are required', () => {
    for (const field of ['headSha', 'statusDigest', 'manifestVersion', 'upstreamSha']) {
      const wire = JSON.parse(serializeReleasePlan(examplePlan())) as {
        fingerprint: Record<string, unknown>
      }
      delete wire.fingerprint[field]

      expect(() => parseReleasePlan(wire), field).toThrow(InvalidReleasePlan)
    }
  })

  it('rejects a malformed field', () => {
    const wire = JSON.parse(serializeReleasePlan(examplePlan())) as Record<string, unknown>
    wire.createdAt = 42

    expect(() => parseReleasePlan(wire)).toThrow(InvalidReleasePlan)
  })

  it('rejects an unknown discriminant', () => {
    const wire = JSON.parse(serializeReleasePlan(examplePlan())) as {
      npmPublish: Record<string, unknown>
    }
    wire.npmPublish.kind = 'unpublish'

    expect(() => parseReleasePlan(wire)).toThrow(InvalidReleasePlan)
  })

  it('rejects an unknown key rather than dropping it', () => {
    const wire = JSON.parse(serializeReleasePlan(examplePlan())) as Record<string, unknown>
    wire.publishAnyway = true

    expect(() => parseReleasePlan(wire)).toThrow(InvalidReleasePlan)
  })

  it('rejects a negative edit offset', () => {
    const wire = JSON.parse(serializeReleasePlan(examplePlan())) as {
      fileMutations: { edits: { offset: number }[] }[]
    }
    wire.fileMutations[0]!.edits[0]!.offset = -1

    expect(() => parseReleasePlan(wire)).toThrow(InvalidReleasePlan)
  })

  it('rejects text that is not JSON at all', () => {
    expect(() => deserializeReleasePlan('{ not json')).toThrow(InvalidReleasePlan)
  })
})
