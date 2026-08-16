import { describe, expect, it } from 'vitest'
import {
  finalizeRelease,
  type FinalizeReleaseDependencies,
} from '../../src/application/finalize-release.js'
import { FinalizeTimedOut, UsageError, WorkflowRunsFailed } from '../../src/domain/errors.js'
import type { GitHubRelease, GitHubWorkflowRun } from '../../src/github/types.js'

const TAG = 'v2-v0.35.0'

function release(draft: boolean): GitHubRelease {
  return {
    id: 7,
    tag: TAG,
    url: 'https://example.invalid/releases/v2-v0.35.0',
    draft,
    prerelease: false,
  }
}

function run(name: string, status: string, conclusion: string | null): GitHubWorkflowRun {
  return { id: 1, name, status, conclusion }
}

type Overrides = Partial<FinalizeReleaseDependencies>

function dependencies(overrides: Overrides): FinalizeReleaseDependencies {
  return {
    readReleaseByTag: async () => release(true),
    readWorkflowRunsForRef: async () => [run('publish', 'completed', 'success')],
    publishRelease: async () => release(false),
    sleep: async () => undefined,
    log: () => undefined,
    ...overrides,
  }
}

const request = { tag: TAG, wait: true, pollIntervalMs: 1_000, timeoutMs: 5_000 }

describe('finalizeRelease', () => {
  it('rejects a tag without a release', async () => {
    const deps = dependencies({ readReleaseByTag: async () => null })
    await expect(finalizeRelease(deps, request)).rejects.toBeInstanceOf(UsageError)
  })

  it('reports an already published release without touching workflow runs', async () => {
    const deps = dependencies({
      readReleaseByTag: async () => release(false),
      readWorkflowRunsForRef: async () => {
        throw new Error('must not poll')
      },
    })
    const result = await finalizeRelease(deps, request)
    expect(result.kind).toBe('already-published')
  })

  it('polls until pending runs complete, then publishes', async () => {
    const responses = [
      [],
      [run('publish', 'in_progress', null)],
      [run('publish', 'completed', 'success'), run('docker', 'completed', 'skipped')],
    ]
    let published = false
    const deps = dependencies({
      readWorkflowRunsForRef: async () => responses.shift() ?? [],
      publishRelease: async () => {
        published = true
        return release(false)
      },
    })
    const result = await finalizeRelease(deps, request)
    expect(result.kind).toBe('published')
    expect(published).toBe(true)
    expect(responses).toHaveLength(0)
  })

  it('refuses to publish when a workflow run failed', async () => {
    const deps = dependencies({
      readWorkflowRunsForRef: async () => [
        run('publish', 'completed', 'success'),
        run('docker', 'completed', 'failure'),
      ],
      publishRelease: async () => {
        throw new Error('must not publish')
      },
    })
    await expect(finalizeRelease(deps, request)).rejects.toBeInstanceOf(WorkflowRunsFailed)
  })

  it('times out when runs never complete', async () => {
    const deps = dependencies({
      readWorkflowRunsForRef: async () => [run('publish', 'in_progress', null)],
    })
    await expect(finalizeRelease(deps, request)).rejects.toBeInstanceOf(FinalizeTimedOut)
  })

  it('publishes without polling under --no-wait', async () => {
    const deps = dependencies({
      readWorkflowRunsForRef: async () => {
        throw new Error('must not poll')
      },
    })
    const result = await finalizeRelease(deps, { ...request, wait: false })
    expect(result.kind).toBe('published')
  })
})
