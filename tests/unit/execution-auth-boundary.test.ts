import { describe, expect, it } from 'vitest'
import { createExecutionDependencies } from '../../src/application/create-execution-dependencies.js'
import { GitHubAuthFailed } from '../../src/domain/errors.js'
import { examplePlan } from '../helpers/plan-fixture.js'

describe('execution authentication boundary', () => {
  it('reports missing GitHub credentials as a typed authentication failure', async () => {
    const dependencies = createExecutionDependencies({
      git: {} as any,
      npm: {} as any,
      github: null,
    })

    await expect(
      dependencies.stages['github-release'].check(examplePlan(), { releaseCommitSha: null }),
    ).rejects.toBeInstanceOf(GitHubAuthFailed)
  })
})
