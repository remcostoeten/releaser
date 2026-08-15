import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

const CLI_ENTRY = fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url))

describe('releaser --help', () => {
  it('exits 0 and lists every command in the CLI surface', async () => {
    const result = await execa('npx', ['tsx', CLI_ENTRY, '--help'], { reject: false })

    expect(result.exitCode).toBe(0)
    for (const command of ['plan', 'status', 'doctor', 'scan', 'resume']) {
      expect(result.stdout).toContain(command)
    }
  })
})
