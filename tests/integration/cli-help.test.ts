import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

const CLI_ENTRY = fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url))

describe('releaser --help', () => {
  it('exits 0 and lists every command in the CLI surface', async () => {
    const result = await execa('npx', ['tsx', CLI_ENTRY, '--help'], { reject: false })

    expect(result.exitCode).toBe(0)
    for (const command of ['plan', 'status', 'doctor', 'scan', 'resume', 'ship', 'completion']) {
      expect(result.stdout).toContain(command)
    }
  })
})

describe('shell completion', () => {
  it.each(['bash', 'zsh', 'fish'])(
    'renders %s completion without repository access',
    async (shell) => {
      const result = await execa('npx', ['tsx', CLI_ENTRY, 'completion', shell], { reject: false })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('ship')
      expect(result.stdout).toContain('releaser')
    },
  )

  it('requires explicit approval for non-interactive ship', async () => {
    const result = await execa(
      'npx',
      ['tsx', CLI_ENTRY, 'ship', '--bump', 'patch', '--message', 'feat: test', '--no-interactive'],
      { reject: false },
    )

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('requires --yes')
  })
})

describe('non-interactive planning', () => {
  it('names the required version-selection flags', async () => {
    const result = await execa('npx', ['tsx', CLI_ENTRY, 'plan'], { reject: false })

    expect(result.exitCode).not.toBe(0)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('Provide --bump')
    expect(result.stdout).toBe('')
  })
})
