import { describe, expect, it } from 'vitest'
import { createCommandRunner } from '../../src/shared/command-runner.js'
import { createRedactor, REDACTED } from '../../src/shared/redaction.js'

describe('secret command output', () => {
  it('returns a secret for in-memory use and redacts later command metadata', async () => {
    const redactor = createRedactor()
    const runner = createCommandRunner({ redactor })
    const token = 'gho_abcdefghijklmnopqrstuvwxyz012345'

    await expect(
      runner.readSecret(process.execPath, ['--eval', `process.stdout.write('${token}')`]),
    ).resolves.toBe(token)

    const result = await runner.run(process.execPath, [
      '--eval',
      `process.stdout.write('${token}')`,
    ])
    expect(result.stdout).toBe(REDACTED)
    expect(result.commandLine).not.toContain(token)
  })
})
