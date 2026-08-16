import { describe, expect, it } from 'vitest'
import {
  renderActionRows,
  renderCheckRow,
  renderCheckRows,
  renderCheckSummary,
  renderError,
  renderFileDiffs,
  renderKeyValueRows,
  renderOccurrences,
  renderSuccessSummary,
  sanitizeTerminalText,
  type CheckStatus,
  type OutputEnvironment,
} from '../../src/ui/index.js'

const plain: OutputEnvironment = { colorEnabled: false }
const colour: OutputEnvironment = { colorEnabled: true }

describe('UI rendering foundation', () => {
  it('aligns key/value rows without colour when disabled', () => {
    expect(
      renderKeyValueRows(
        [
          { label: 'Tag', value: 'v1.2.3', state: 'success' },
          { label: 'Branch', value: 'main' },
        ],
        plain,
      ),
    ).toBe('Tag     v1.2.3\nBranch  main')
  })

  it('uses colour only when enabled', () => {
    expect(renderCheckRow({ status: 'passed', title: 'Git available' }, colour)).toContain(
      '\u001B[32mPASS\u001B[0m',
    )
    expect(renderCheckRow({ status: 'passed', title: 'Git available' }, plain)).not.toContain(
      '\u001B[',
    )
  })

  it.each<CheckStatus>(['passed', 'warned', 'blocked', 'skipped', 'overridden'])(
    'renders %s checks',
    (status) => {
      expect(
        renderCheckRow(
          {
            status,
            title: 'Repository state',
            message: 'State details',
            remediation: 'Resolve state',
          },
          plain,
        ),
      ).toMatchSnapshot()
    },
  )

  it('renders check summaries with pluralization', () => {
    expect(
      renderCheckSummary({ passed: 1, warned: 2, blocked: 0, skipped: 1, overridden: 0 }, plain),
    ).toBe('1 passed check, 2 warnings, 0 blockers, 1 skipped check, 0 overrides')
  })

  it('renders ordered actions and multiline diffs', () => {
    expect(
      renderActionRows(
        [
          { position: 1, label: 'Mutate files', status: 'completed' },
          { position: 2, label: 'Publish npm', status: 'skipped', detail: 'disabled' },
        ],
        plain,
      ),
    ).toBe('1. Mutate files [completed]\n2. Publish npm [skipped] — disabled')
    expect(
      renderFileDiffs([{ path: 'package.json', diff: '@@ -1 +1 @@\n- 1.2.3\n+ 1.2.4' }], plain),
    ).toBe('package.json\n@@ -1 +1 @@\n- 1.2.3\n+ 1.2.4')
  })

  it('renders occurrence locations and empty lists', () => {
    expect(
      renderOccurrences(
        [{ path: 'src/version.ts', line: 4, column: 12, preview: "'1.2.3'" }],
        plain,
      ),
    ).toBe("src/version.ts:4:12  '1.2.3'")
    expect(renderOccurrences([], plain)).toBe('No tracked occurrences found.')
    expect(renderCheckRows([], plain)).toBe('No checks.')
    expect(renderActionRows([], plain)).toBe('No actions.')
    expect(renderFileDiffs([], plain)).toBe('No file changes.')
  })

  it('renders actionable errors and success summaries', () => {
    expect(
      renderError(
        {
          title: 'Release incomplete',
          message: 'npm publish failed',
          details: [{ label: 'Completed', value: 'commit, tag' }],
          remediation: 'Check npm registry.',
          recoveryCommand: 'releaser resume',
        },
        plain,
      ),
    ).toContain('Recover: releaser resume')
    expect(
      renderSuccessSummary(
        {
          title: 'Released example@1.2.3',
          rows: [{ label: 'Tag', value: 'v1.2.3' }],
          skipped: ['GitHub Release — disabled'],
          journalPath: '/state/releaser/journal.json',
        },
        plain,
      ),
    ).toContain('Skipped: GitHub Release — disabled')
  })

  it('strips hostile terminal control sequences', () => {
    const hostile = '\u001B[31mowned\u001B[0m\u0007'
    expect(sanitizeTerminalText(hostile)).toBe('owned')
    expect(renderCheckRow({ status: 'blocked', title: hostile }, plain)).toBe('BLOCK  owned')
  })
})
