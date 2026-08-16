import { describe, expect, it } from 'vitest'
import type { ExecuteReleasePlanResult } from '../../src/application/execute-release-plan.js'
import { sanitizeTerminalText } from '../../src/ui/index.js'
import {
  createProgressReporter,
  dryRunSummaryView,
  executionProgressView,
  releaseSummaryView,
  renderExecutionResult,
} from '../../src/cli/execution-output.js'
import { examplePlan } from '../helpers/plan-fixture.js'

const plain = { colorEnabled: false }

describe('execution output', () => {
  it('renders stable TTY and non-TTY progress without exposing registry errors', () => {
    const plainLines: string[] = []
    const colourLines: string[] = []
    const nonTty = createProgressReporter(false, plain, (line) => plainLines.push(line))
    const tty = createProgressReporter(false, { colorEnabled: true }, (line) =>
      colourLines.push(line),
    )

    for (const reporter of [nonTty, tty]) {
      reporter.onEvent({ kind: 'stage-started', stage: 'npm-publish' })
      reporter.onEvent({ kind: 'publish-outcome-unknown', stage: 'npm-publish' })
      reporter.onEvent({ kind: 'stage-failed', stage: 'npm-publish' })
    }

    expect(plainLines).toEqual([
      '6. Publish to npm [active]',
      '6. Publish to npm [unknown] — command outcome unknown; verifying npm registry',
      '6. Publish to npm [failed]',
    ])
    expect(colourLines.join('\n')).toContain('\u001B[')
    expect(colourLines.map((line) => sanitizeTerminalText(line))).toEqual(plainLines)
  })

  it('keeps JSON progress quiet', () => {
    const lines: string[] = []
    const reporter = createProgressReporter(true, plain, (line) => lines.push(line))

    reporter.onEvent({ kind: 'stage-started', stage: 'commit' })
    reporter.onEvent({ kind: 'stage-succeeded', stage: 'commit' })

    expect(lines).toEqual([])
    expect(reporter.events).toHaveLength(2)
  })

  it('maps skipped resume stages to verified progress', () => {
    expect(
      executionProgressView({
        kind: 'stage-skipped',
        stage: 'tag',
        reason: 'already complete; verified',
        verification: 'already-complete',
      }),
    ).toEqual({
      position: 3,
      label: 'Create annotated tag',
      status: 'verified',
      detail: 'already complete; verified',
    })
  })

  it('renders full and resumed completion summaries', () => {
    const plan = examplePlan()
    const result: Extract<ExecuteReleasePlanResult, { kind: 'completed' }> = {
      kind: 'completed',
      journalPath: '/state/releaser/journal.json',
      stages: [
        { stage: 'mutate-files', outcome: 'skipped' },
        { stage: 'commit', outcome: 'succeeded' },
        { stage: 'tag', outcome: 'succeeded' },
        { stage: 'push-branch', outcome: 'succeeded' },
        { stage: 'push-tag', outcome: 'succeeded' },
        { stage: 'npm-publish', outcome: 'succeeded' },
        {
          stage: 'github-release',
          outcome: 'succeeded',
          details: { url: 'https://github.com/remcostoeten/releaser/releases/tag/v1.3.0-beta.0' },
        },
      ],
    }

    const normal = renderExecutionResult(plan, result, plain)
    const resumed = releaseSummaryView(plan, result, true)

    expect(normal).toContain('Released example-package@1.3.0-beta.0')
    expect(normal).toContain('example-package@1.3.0-beta.0 (beta)')
    expect(normal).toContain('https://github.com/remcostoeten/releaser/releases/tag/')
    expect(normal).toContain('/state/releaser/journal.json')
    expect(resumed.title).toContain('Resumed release')
    expect(resumed.rows).toContainEqual({ label: 'Resume', value: '1 verified, 6 newly completed' })
  })

  it('renders dry-run inspection and readable diffs', () => {
    const result: Extract<ExecuteReleasePlanResult, { kind: 'dry-run' }> = {
      kind: 'dry-run',
      fileDiff: [
        {
          path: 'package.json',
          unified: '--- a/package.json\n+++ b/package.json\n-"version":"1.0.0"\n+"version":"1.0.1"',
        },
      ],
      packageInspection: { name: 'example', version: '1.0.1' },
      publishInspection: { ok: true },
    }

    const view = dryRunSummaryView(result)
    const rendered = renderExecutionResult(examplePlan(), result, plain)

    expect(view.packageRows).toEqual([{ label: 'Package', value: 'example@1.0.1' }])
    expect(rendered).toContain('Dry run complete — nothing was written')
    expect(rendered).toContain('--- a/package.json')
  })
})
