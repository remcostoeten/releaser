import { describe, expect, it } from 'vitest'
import {
  createShipPlan,
  type CreateShipPlanDependencies,
} from '../../src/application/create-ship-plan.js'
import { ShipTargetDiverged, UsageError } from '../../src/domain/errors.js'
import { branch, sha } from '../helpers/semantic.js'
import { cleanRepositoryState } from '../helpers/recording-ports.js'

function dependencies(
  options: {
    dirty?: boolean
    targetLocal?: string | null
    targetRemote?: string | null
    ancestry?: 'behind' | 'ahead' | 'diverged'
  } = {},
): CreateShipPlanDependencies {
  const state = cleanRepositoryState()
  state.head = {
    kind: 'branch',
    branch: branch('feature'),
    sha: sha('a'.repeat(40)),
    upstream: { kind: 'none' },
  }
  state.workingTree =
    options.dirty === true ? { kind: 'dirty', entries: [' M src/index.ts'] } : { kind: 'clean' }
  const local = options.targetLocal === undefined ? 'b'.repeat(40) : options.targetLocal
  const remote = options.targetRemote === undefined ? 'b'.repeat(40) : options.targetRemote
  return {
    readRepository: () => Promise.resolve({ kind: 'found', state }),
    resolveLocalBranch: () => Promise.resolve(local === null ? null : sha(local)),
    resolveRemoteBranch: () => Promise.resolve(remote === null ? null : sha(remote)),
    isAncestor: (ancestor, descendant) => {
      if (options.ancestry === 'behind') {
        return Promise.resolve(ancestor === local && descendant === remote)
      }
      if (options.ancestry === 'ahead') {
        return Promise.resolve(ancestor === remote && descendant === local)
      }
      return Promise.resolve(false)
    },
    operationInProgress: () => Promise.resolve(false),
  }
}

const request = {
  targetBranch: branch('master'),
  remote: 'origin',
  commitMessage: 'feat: ship it',
  mergeMessage: null,
}

describe('createShipPlan', () => {
  it('plans a feature commit and merge without writing', async () => {
    const plan = await createShipPlan(dependencies({ dirty: true }), request)

    expect(plan.featureCommit).toEqual({ kind: 'create', message: 'feat: ship it' })
    expect(plan.sourceBranch).toBe('feature')
    expect(plan.targetBranch).toBe('master')
    expect(plan.targetState).toBe('synchronized')
  })

  it('supports a missing local target that exists remotely', async () => {
    const plan = await createShipPlan(dependencies({ dirty: true, targetLocal: null }), request)

    expect(plan.targetState).toBe('missing')
    expect(plan.targetLocalSha).toBeNull()
  })

  it('requires a commit message for dirty changes', async () => {
    await expect(
      createShipPlan(dependencies({ dirty: true }), { ...request, commitMessage: null }),
    ).rejects.toBeInstanceOf(UsageError)
  })

  it('rejects a diverged target branch', async () => {
    await expect(
      createShipPlan(
        dependencies({
          dirty: true,
          targetLocal: 'b'.repeat(40),
          targetRemote: 'c'.repeat(40),
          ancestry: 'diverged',
        }),
        request,
      ),
    ).rejects.toBeInstanceOf(ShipTargetDiverged)
  })
})
