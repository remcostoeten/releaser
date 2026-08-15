import { describe, expect, it } from 'vitest'
import { assertNever } from '../../src/domain/exhaustive.js'
import { createReleasePlan, planStageActions, planStages } from '../../src/domain/release-plan.js'
import { STAGE_ORDER, type StageAction } from '../../src/domain/stages.js'
import { examplePlan } from '../helpers/plan-fixture.js'

function describeAction(action: StageAction): string {
  switch (action.stage) {
    case 'mutate-files':
      return `${action.mutations.length} file(s)`
    case 'commit':
      return action.commit.message
    case 'tag':
      return action.tag.name
    case 'push-branch':
      return action.push.target.kind
    case 'push-tag':
      return action.push.target.kind
    case 'npm-publish':
      return `${action.publish.packageName}@${action.publish.distTag}`
    case 'github-release':
      return action.release.tagName
    default:
      return assertNever(action, 'describeAction')
  }
}

describe('planStageActions', () => {
  it('carries what each stage needs, in the order SPEC §7.2 requires', () => {
    const actions = planStageActions(examplePlan())

    expect(actions.map((action) => action.stage)).toEqual(STAGE_ORDER)
    expect(actions.map((action) => describeAction(action))).toEqual([
      '2 file(s)',
      'chore(release): 1.3.0-beta.0',
      'v1.3.0-beta.0',
      'branch',
      'tag',
      'example-package@beta',
      'v1.3.0-beta.0',
    ])
  })

  it('omits a stage the plan skips rather than carrying it inert', () => {
    const plan = createReleasePlan({
      ...examplePlan(),
      npmPublish: { kind: 'skipped', reason: 'npm.publish is disabled in configuration' },
    })

    expect(planStages(plan)).toEqual([
      'mutate-files',
      'commit',
      'tag',
      'push-branch',
      'push-tag',
      'github-release',
    ])
  })

  it('reduces to nothing but the Git stages when both publications are skipped', () => {
    const plan = createReleasePlan({
      ...examplePlan(),
      npmPublish: { kind: 'skipped', reason: 'disabled' },
      githubRelease: { kind: 'skipped', reason: 'No GitHub token available' },
    })

    expect(planStages(plan)).toEqual(['mutate-files', 'commit', 'tag', 'push-branch', 'push-tag'])
  })
})

describe('assertNever', () => {
  it('reports the value that escaped the type system', () => {
    expect(() => assertNever('surprise' as never, 'a test')).toThrow(/a test/)
  })
})
