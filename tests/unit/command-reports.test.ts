import { describe, expect, it } from 'vitest'
import {
  doctorReportView,
  planReportView,
  scanReportView,
  statusReportView,
} from '../../src/cli/command-reports.js'
import { checkBlocked, checkPassed, checkWarned } from '../../src/domain/checks.js'
import { createReleasePlan } from '../../src/domain/release-plan.js'
import {
  renderDoctorReport,
  renderPlanReport,
  renderScanReport,
  renderStatusReport,
} from '../../src/ui/index.js'
import { examplePlan } from '../helpers/plan-fixture.js'

const plain = { colorEnabled: false }
const colour = { colorEnabled: true }

describe('plan reports', () => {
  it('renders plan decisions, checks, diffs, actions, and note sections without internals', () => {
    const output = renderPlanReport(
      planReportView({
        kind: 'planned',
        plan: examplePlan(),
        checks: [
          checkPassed('git-available', 'Git available'),
          checkWarned('on-release-branch', 'Release branch', 'Using feature branch', 'Use main'),
          checkBlocked(
            'working-tree-clean',
            'Working tree clean',
            'Tree is dirty',
            'Commit changes',
            true,
          ),
        ],
      }),
      plain,
    )

    expect(output).toContain('Package       example-package')
    expect(output).toContain('Version       1.2.3 -> 1.3.0-beta.0')
    expect(output.indexOf('BLOCK')).toBeLessThan(output.indexOf('PASS'))
    expect(output).toContain('--- a/package.json\n+++ b/package.json\n-1.2.3\n+1.3.0-beta.0')
    expect(output).toContain('6. Publish to npm [pending]')
    expect(output).toContain('Features: 1 change')
    expect(output).toContain('Planning made no changes.')
    expect(output).not.toMatch(/schemaVersion|statusDigest|offset/u)
    expect(output).not.toContain('\u001B')
  })

  it('renders skipped plan stages and empty notes', () => {
    const source = examplePlan()
    const plan = createReleasePlan({
      ...source,
      npmPublish: { kind: 'skipped', reason: 'npm disabled' },
      githubRelease: { kind: 'skipped', reason: 'GitHub disabled' },
      notes: { ...source.notes, sections: [] },
    })
    const output = renderPlanReport(planReportView({ kind: 'planned', plan, checks: [] }), plain)

    expect(output).toContain('Publish to npm [skipped] — npm disabled')
    expect(output).toContain('Create GitHub Release [skipped] — GitHub disabled')
    expect(output).toContain('No release-note changes.')
  })
})

describe('doctor reports', () => {
  it('renders all states, remediation, and counts', () => {
    const output = renderDoctorReport(
      doctorReportView([
        checkPassed('git-available', 'Git available'),
        checkWarned('on-release-branch', 'Release branch', 'Wrong branch', 'Switch branch'),
        checkBlocked('working-tree-clean', 'Working tree clean', 'Dirty', 'Commit changes', true),
      ]),
      plain,
    )

    expect(output).toContain('Fix: Switch branch')
    expect(output).toContain('Fix: Commit changes')
    expect(output).toContain('1 passed check, 1 warning, 1 blocker')
  })
})

describe('status reports', () => {
  it('renders published, never-published, skipped, and unavailable services', () => {
    const base = statusFixture()
    const outputs = [
      renderStatusReport(
        statusReportView({
          ...base,
          registry: { kind: 'published', versions: ['1.2.3'] },
          github: {
            kind: 'release',
            tag: 'v1.2.3',
            url: 'https://github.com/acme/tool/releases/tag/v1.2.3',
            draft: false,
            prerelease: false,
          },
        }),
        plain,
      ),
      renderStatusReport(
        statusReportView({
          ...base,
          registry: { kind: 'never-published' },
          github: { kind: 'skipped', reason: 'disabled' },
        }),
        plain,
      ),
      renderStatusReport(
        statusReportView({
          ...base,
          registry: { kind: 'unavailable', reason: 'offline' },
          github: { kind: 'unauthenticated', reason: 'token required' },
        }),
        plain,
      ),
    ]

    expect(outputs[0]).toContain('current published')
    expect(outputs[0]).toContain('Published release')
    expect(outputs[1]).toContain('Never published')
    expect(outputs[1]).toContain('Skipped: disabled')
    expect(outputs[2]).toContain('Unavailable: offline')
    expect(outputs[2]).toContain('Unauthenticated: token required')
  })
})

describe('scan reports', () => {
  it('renders zero, one, and multiple occurrences with exact locations', () => {
    const empty = renderScanReport(scanReportView({ version: '1.2.3', occurrences: [] }), plain)
    const one = renderScanReport(
      scanReportView({
        version: '1.2.3',
        occurrences: [{ file: 'package.json', line: 2, column: 15 }],
      }),
      plain,
    )
    const multiple = renderScanReport(
      scanReportView({
        version: '1.2.3',
        occurrences: [
          { file: 'README.md', line: 4, column: 8 },
          { file: 'src/version.ts', line: 1, column: 20 },
        ],
      }),
      colour,
    )

    expect(empty).toContain('No tracked occurrences found.')
    expect(one).toContain('package.json:2:15')
    expect(multiple).toContain('README.md:4:8')
    expect(multiple).toContain('src/version.ts:1:20')
    expect(multiple).toContain('\u001B')
    expect(empty).not.toContain('\u001B')
  })
})

function statusFixture(): ReturnType<typeof statusFixtureValue> {
  return statusFixtureValue()
}

function statusFixtureValue() {
  return {
    repository: { kind: 'no-commits' as const, root: '/tmp/tool' },
    manifest: {
      kind: 'found' as const,
      manifest: {
        name: 'tool' as never,
        version: '1.2.3' as never,
        private: false,
        publishConfig: null,
        files: null,
        root: '/tmp/tool' as never,
      },
    },
    registry: { kind: 'skipped' as const, reason: 'disabled' },
    tag: { kind: 'available' as const, name: 'v1.2.3', local: true, remote: false },
    github: { kind: 'not-released' as const, tag: 'v1.2.3' },
  }
}
