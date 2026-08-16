import { Command } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkBlocked, checkPassed } from '../../src/domain/checks.js'

const mocks = vi.hoisted(() => ({ doctorRelease: vi.fn() }))

vi.mock('../../src/cli/release-service.js', () => ({
  doctorRelease: mocks.doctorRelease,
}))

import { registerDoctorCommand } from '../../src/cli/commands/doctor.js'

afterEach(() => {
  process.exitCode = 0
  vi.restoreAllMocks()
  mocks.doctorRelease.mockReset()
})

describe('doctor command', () => {
  it('prints one JSON value before assigning blocked exit status', async () => {
    mocks.doctorRelease.mockResolvedValue({
      kind: 'doctor',
      checks: [
        checkBlocked('working-tree-clean', 'Working tree clean', 'Dirty', 'Commit changes', true),
      ],
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    const program = doctorProgram()

    await program.parseAsync(['node', 'test', '--json', 'doctor'])

    expect(output).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toEqual({
      kind: 'doctor',
      checks: [
        {
          id: 'working-tree-clean',
          title: 'Working tree clean',
          outcome: 'blocked',
          overridable: true,
          message: 'Dirty',
          remediation: 'Commit changes',
        },
      ],
    })
    expect(process.exitCode).toBe(3)
  })

  it('keeps successful doctor exit status zero', async () => {
    mocks.doctorRelease.mockResolvedValue({
      kind: 'doctor',
      checks: [checkPassed('git-available', 'Git available')],
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await doctorProgram().parseAsync(['node', 'test', 'doctor'])

    expect(process.exitCode).toBe(0)
  })
})

function doctorProgram(): Command {
  const program = new Command().option('--json')
  registerDoctorCommand(program)
  return program
}
