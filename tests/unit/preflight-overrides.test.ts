import { describe, expect, it, vi } from 'vitest'
import { authorizePreflight } from '../../src/cli/preflight-overrides.js'
import { checkBlocked, checkPassed, type ReleaseCheck } from '../../src/domain/checks.js'
import { Cancelled, PreflightFailed } from '../../src/domain/errors.js'

function blocked(
  id: 'working-tree-clean' | 'no-detached-head' | 'tag-available' | 'github-token-valid',
  overridable = true,
): ReleaseCheck {
  return checkBlocked(id, `Check ${id}`, `Message ${id}`, `Fix ${id}`, overridable)
}

describe('preflight override authorization', () => {
  it('requires no prompts when no blockers exist', async () => {
    const confirmOverride = vi.fn<() => Promise<boolean>>()
    await expect(
      authorizePreflight([checkPassed('git-available', 'Git available')], {
        yes: false,
        canPrompt: true,
        confirmOverride,
      }),
    ).resolves.toEqual([])
    expect(confirmOverride).not.toHaveBeenCalled()
  })

  it('asks separately for every blocker and records each decision', async () => {
    const confirmOverride = vi.fn(async (_message: string) => true)
    const checks = [blocked('working-tree-clean'), blocked('github-token-valid')]
    await expect(
      authorizePreflight(checks, { yes: false, canPrompt: true, confirmOverride }),
    ).resolves.toEqual(['working-tree-clean', 'github-token-valid'])
    expect(confirmOverride).toHaveBeenCalledTimes(2)
    expect(confirmOverride.mock.calls[0]?.[0]).toContain('Uncommitted files')
    expect(confirmOverride.mock.calls[1]?.[0]).toContain('GitHub Release stage will be skipped')
    for (const check of checks) {
      const prompt = confirmOverride.mock.calls.find((call) => call[0].includes(check.title))?.[0]
      expect(prompt).toContain(check.outcome === 'blocked' ? check.message : '')
      expect(prompt).toContain(check.outcome === 'blocked' ? check.remediation : '')
    }
  })

  it.each([0, 1])('cancels at override prompt %i before writes', async (declinedAt) => {
    let writes = 0
    const confirmOverride = vi.fn(
      async (_message: string) => confirmOverride.mock.calls.length - 1 < declinedAt,
    )
    await expect(
      authorizePreflight([blocked('working-tree-clean'), blocked('no-detached-head')], {
        yes: false,
        canPrompt: true,
        confirmOverride,
      }).then(() => {
        writes += 1
      }),
    ).rejects.toBeInstanceOf(Cancelled)
    expect(writes).toBe(0)
    expect(confirmOverride).toHaveBeenCalledTimes(declinedAt + 1)
  })

  it('rejects non-overridable blockers without prompting, including with --yes', async () => {
    const confirmOverride = vi.fn(async (_message: string) => true)
    await expect(
      authorizePreflight([blocked('tag-available', false)], {
        yes: true,
        canPrompt: true,
        confirmOverride,
      }),
    ).rejects.toBeInstanceOf(PreflightFailed)
    expect(confirmOverride).not.toHaveBeenCalled()
  })

  it('allows --yes to record overridable blockers without prompting', async () => {
    const confirmOverride = vi.fn(async (_message: string) => true)
    await expect(
      authorizePreflight([blocked('working-tree-clean'), blocked('no-detached-head')], {
        yes: true,
        canPrompt: false,
        confirmOverride,
      }),
    ).resolves.toEqual(['working-tree-clean', 'no-detached-head'])
    expect(confirmOverride).not.toHaveBeenCalled()
  })

  it('rejects blockers when prompting and --yes are disabled', async () => {
    await expect(
      authorizePreflight([blocked('working-tree-clean')], { yes: false, canPrompt: false }),
    ).rejects.toBeInstanceOf(PreflightFailed)
  })
})
