import { Command } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  planRelease: vi.fn(),
  readReleaseStatus: vi.fn(),
  scanRelease: vi.fn(),
  readHumanReleaseStatus: vi.fn(),
}))

vi.mock('../../src/cli/release-service.js', () => ({
  planRelease: mocks.planRelease,
  readReleaseStatus: mocks.readReleaseStatus,
  scanRelease: mocks.scanRelease,
}))
vi.mock('../../src/cli/status-service.js', () => ({
  readHumanReleaseStatus: mocks.readHumanReleaseStatus,
}))

import { registerPlanCommand } from '../../src/cli/commands/plan.js'
import { registerScanCommand } from '../../src/cli/commands/scan.js'
import { registerStatusCommand } from '../../src/cli/commands/status.js'

afterEach(() => {
  vi.restoreAllMocks()
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
})

describe('report command JSON output', () => {
  it('preserves plan JSON as one compact value', async () => {
    const result = { kind: 'not-planned', checks: [] }
    mocks.planRelease.mockResolvedValue(result)

    const output = await runCommand(registerPlanCommand, ['--bump', 'patch', 'plan'])

    expect(output).toBe(JSON.stringify(result))
    expect(JSON.parse(output)).toEqual(result)
  })

  it('preserves status JSON without invoking human-only reads', async () => {
    const result = {
      kind: 'status',
      repository: { kind: 'not-a-repository', path: '/tmp/repo' },
      manifest: { kind: 'unreadable', path: '/tmp/repo/package.json', reason: 'missing' },
      registry: { kind: 'unavailable' },
    }
    mocks.readReleaseStatus.mockResolvedValue(result)

    const output = await runCommand(registerStatusCommand, ['status'])

    expect(JSON.parse(output)).toEqual(result)
    expect(mocks.readHumanReleaseStatus).not.toHaveBeenCalled()
  })

  it('preserves scan JSON as one compact value', async () => {
    const result = {
      kind: 'scan',
      version: '1.2.3',
      occurrences: [{ file: 'package.json', line: 2, column: 15 }],
    }
    mocks.scanRelease.mockResolvedValue(result)

    const output = await runCommand(registerScanCommand, ['scan'])

    expect(output).toBe(JSON.stringify(result))
    expect(JSON.parse(output)).toEqual(result)
  })
})

async function runCommand(
  register: (program: Command) => void,
  arguments_: string[],
): Promise<string> {
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const program = new Command().option('--json').option('--bump <kind>').option('--cwd <path>')
  register(program)
  await program.parseAsync(['node', 'test', '--json', ...arguments_])
  expect(output).toHaveBeenCalledTimes(1)
  return String(output.mock.calls[0]?.[0])
}
