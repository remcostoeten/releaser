import { describe, expect, it } from 'vitest'
import {
  releaserErrorView,
  renderReleaserError,
  renderUnknownError,
} from '../../src/cli/error-output.js'
import { checkBlocked } from '../../src/domain/checks.js'
import { CommandFailed, PartialRelease, PreflightFailed } from '../../src/domain/errors.js'

describe('CLI error output', () => {
  it('renders every preflight blocker with message and remediation', () => {
    const error = new PreflightFailed([
      checkBlocked('working-tree-clean', 'Clean tree', 'Tree is dirty', 'Commit changes.', true),
      checkBlocked(
        'tag-available',
        'Tag available',
        'Tag exists',
        'Choose another version.',
        false,
      ),
    ])
    const output = renderReleaserError(error, false)
    expect(output).toContain('Preflight blocked')
    expect(output).toContain('Clean tree')
    expect(output).toContain('Tree is dirty')
    expect(output).toContain('Commit changes.')
    expect(output).toContain('Tag available')
    expect(output).toContain('Choose another version.')
    expect(output).not.toContain('\u001B')
  })

  it('renders partial-release stage state and exact recovery command', () => {
    const error = new PartialRelease(
      ['mutate-files', 'commit'],
      'tag',
      ['push-branch', 'push-tag'],
      'releaser resume --cwd "/tmp/repo"',
      'tag failed',
    )
    const output = renderReleaserError(error, false)
    expect(output).toContain('Completed')
    expect(output).toContain('mutate-files')
    expect(output).toContain('Failed')
    expect(output).toContain('tag')
    expect(output).toContain('Remaining')
    expect(output).toContain('push-branch')
    expect(output).toContain('Recover: releaser resume --cwd "/tmp/repo"')
  })

  it('redacts secrets from normal, verbose, and serializable error views', () => {
    const token = 'github_pat_abcdefghijklmnopqrstuvwxyz123456'
    const error = new CommandFailed('tool', 1, token, `Bearer ${token}`)
    const unknown = new Error(`failed with ${token}`)
    expect(renderReleaserError(error, false)).not.toContain(token)
    expect(renderUnknownError(unknown, true)).not.toContain(token)
    expect(JSON.stringify(releaserErrorView(error))).not.toContain(token)
  })

  it('shows stacks only in verbose unknown-error output', () => {
    const error = new Error('broken')
    expect(renderUnknownError(error, false)).toBe('broken')
    expect(renderUnknownError(error, true)).toContain('Error: broken')
    expect(renderUnknownError(error, true)).toContain('cli-error-output.test.ts')
  })
})
