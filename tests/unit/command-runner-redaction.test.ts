import { describe, expect, it } from 'vitest'
import { createCommandRunner } from '../../src/shared/command-runner.js'

describe('command result redaction', () => {
  it('does not expose an OTP in command metadata', async () => {
    const runner = createCommandRunner()
    const result = await runner.run(process.execPath, ['-e', '', '--otp', '654321'])

    expect(result.args).toEqual(['-e', '', '--otp', '[redacted]'])
    expect(result.commandLine).not.toContain('654321')
  })
})
