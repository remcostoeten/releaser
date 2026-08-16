import { Command } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examplePlan } from '../helpers/plan-fixture.js'

const mocks = vi.hoisted(() => ({
  executePlannedRelease: vi.fn(),
  planRelease: vi.fn(),
  resumeReleaseFromCli: vi.fn(),
  inspectShip: vi.fn(),
}))

vi.mock('../../src/cli/release-service.js', () => ({
  executePlannedRelease: mocks.executePlannedRelease,
  planRelease: mocks.planRelease,
  resumeReleaseFromCli: mocks.resumeReleaseFromCli,
}))
vi.mock('../../src/cli/ship-service.js', () => ({
  inspectShip: mocks.inspectShip,
}))
vi.mock('../../src/cli/commands/ship.js', () => ({ runShipWizard: vi.fn() }))

import { registerReleaseCommand } from '../../src/cli/commands/release.js'
import { registerResumeCommand } from '../../src/cli/commands/resume.js'

afterEach(() => {
  vi.restoreAllMocks()
  for (const mock of Object.values(mocks)) {
    mock.mockReset()
  }
})

describe('execution command JSON output', () => {
  it('writes release result as exactly one parseable value', async () => {
    const plan = examplePlan()
    const result = { kind: 'completed', stages: [], journalPath: '/state/journal.json' }
    mocks.planRelease.mockResolvedValue({ kind: 'planned', plan, checks: [] })
    mocks.executePlannedRelease.mockResolvedValue(result)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const progress = vi.spyOn(console, 'error').mockImplementation(() => {})

    await program(registerReleaseCommand).parseAsync([
      'node',
      'test',
      '--json',
      '--yes',
      '--bump',
      'patch',
    ])

    expect(output).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual(result)
    expect(progress).not.toHaveBeenCalled()
  })

  it('writes resumed result as exactly one parseable value', async () => {
    const result = { kind: 'completed', stages: [], journalPath: '/state/journal.json' }
    mocks.resumeReleaseFromCli.mockResolvedValue(result)
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const progress = vi.spyOn(console, 'error').mockImplementation(() => {})

    await program(registerResumeCommand).parseAsync(['node', 'test', '--json', 'resume'])

    expect(output).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual(result)
    expect(progress).not.toHaveBeenCalled()
  })
})

function program(register: (program: Command) => void): Command {
  const command = new Command()
    .option('--json')
    .option('--yes')
    .option('--bump <kind>')
    .option('--no-interactive')
  register(command)
  return command
}
