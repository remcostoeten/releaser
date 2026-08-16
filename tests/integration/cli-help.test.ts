import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { createProgram } from '../../src/cli/create-program.js'
import { renderCompletion } from '../../src/cli/completions.js'

const CLI_ENTRY = fileURLToPath(new URL('../../src/cli/index.ts', import.meta.url))
const README = fileURLToPath(new URL('../../README.md', import.meta.url))
const COMMANDS = [
  'plan',
  'status',
  'doctor',
  'scan',
  'resume',
  'ship',
  'finalize',
  'completion',
] as const
const GLOBAL_OPTIONS = [
  '--bump',
  '--version',
  '--tag',
  '--dry-run',
  '--yes',
  '--no-interactive',
  '--json',
  '--otp',
  '--cwd',
  '--verbose',
] as const

function runCli(arguments_: readonly string[]) {
  return execa('npx', ['tsx', CLI_ENTRY, ...arguments_], { reject: false })
}

describe('CLI help', () => {
  it('explains the bare command and lists every command', async () => {
    const result = await runCli(['--help'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/Run without a command to start the\s+release wizard\./u)
    expect(result.stdout).not.toMatch(/^\s+release(?:\s|$)/mu)
    for (const command of COMMANDS) {
      expect(result.stdout).toContain(command)
    }
    for (const example of ['plan --bump', '--dry-run', 'ship --bump', 'resume', '--json']) {
      expect(result.stdout).toContain(example)
    }
  })

  it.each(COMMANDS)('shows global options in %s help', async (command) => {
    const result = await runCli([command, '--help'])

    expect(result.exitCode).toBe(0)
    for (const option of GLOBAL_OPTIONS) {
      expect(result.stdout).toContain(option)
    }
  })

  it('shows command-specific ship and finalize options', async () => {
    const [ship, finalize] = await Promise.all([
      runCli(['ship', '--help']),
      runCli(['finalize', '--help']),
    ])

    for (const option of ['--target', '--message', '--merge-message']) {
      expect(ship.stdout).toContain(option)
    }
    for (const option of ['--no-wait', '--poll', '--timeout']) {
      expect(finalize.stdout).toContain(option)
    }
  })

  it.each([
    ['--verbose', 'plan', '--bump', 'patch', '--help'],
    ['plan', '--bump', 'patch', '--verbose', '--help'],
  ])('accepts global options before or after a subcommand', async (...arguments_) => {
    const result = await runCli(arguments_)

    expect(result.exitCode).toBe(0)
  })

  it('propagates verbose through subcommand global options', async () => {
    const program = createProgram('0.0.0')
    const status = program.commands.find((command) => command.name() === 'status')
    let verbose = false
    status?.action((_options, command) => {
      verbose = command.optsWithGlobals().verbose === true
    })

    await program.parseAsync(['status', '--verbose'], { from: 'user' })

    expect(verbose).toBe(true)
  })
})

describe('shell completion', () => {
  it.each(['bash', 'zsh', 'fish'])('includes all commands and options in %s output', (shell) => {
    const output = renderCompletion(shell)

    for (const command of COMMANDS) {
      expect(output).toContain(command)
    }
    for (const option of [
      ...GLOBAL_OPTIONS,
      '--target',
      '--message',
      '--merge-message',
      '--no-wait',
      '--poll',
      '--timeout',
    ]) {
      expect(output).toContain(shell === 'fish' ? `-l ${option.slice(2)}` : option)
    }
    for (const value of ['patch', 'minor', 'major', 'prerelease', 'bash', 'zsh', 'fish']) {
      expect(output).toContain(value)
    }
  })

  it.each(['bash', 'zsh', 'fish'])('renders %s without repository access', async (shell) => {
    const result = await runCli(['completion', shell, '--cwd', '/definitely/not/a/repository'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(renderCompletion(shell))
    expect(result.stderr).toBe('')
  })

  it('rejects unsupported shells as a usage error', async () => {
    const result = await runCli(['completion', 'powershell'])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('Completion shell must be bash, zsh, or fish.')
    expect(result.stdout).toBe('')
  })
})

describe('CLI parsing', () => {
  it.each([
    ['--bump', 'breaking', 'plan'],
    ['plan', '--bump', 'breaking'],
  ])('rejects invalid bump values', async (...arguments_) => {
    const result = await runCli(arguments_)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain(
      'Invalid --bump value "breaking"; expected patch, minor, major, or prerelease.',
    )
    expect(result.stdout).toBe('')
  })

  it('requires explicit approval for non-interactive ship', async () => {
    const result = await runCli([
      'ship',
      '--bump',
      'patch',
      '--message',
      'feat: test',
      '--no-interactive',
    ])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('requires --yes')
  })

  it('names the required version-selection flags', async () => {
    const result = await runCli(['plan'])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('Provide --bump')
    expect(result.stdout).toBe('')
  })
  it('reports a missing --cwd as a usage error without a raw ENOENT', async () => {
    const result = await runCli(['plan', '--bump', 'patch', '--cwd', '/path/that/does/not/exist'])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('Working directory does not exist')
    expect(result.stderr).toContain('Pass --cwd with an existing directory path.')
    expect(result.stderr).not.toContain('ENOENT')
  })

  it('keeps README examples aligned with accepted syntax', async () => {
    const readme = await readFile(README, 'utf8')
    const examples = [
      ['doctor'],
      ['plan', '--bump', 'patch'],
      ['--bump', 'patch', '--dry-run'],
      ['ship', '--bump', 'patch'],
      ['resume'],
      ['status', '--json'],
    ]

    const results = await Promise.all(examples.map((example) => runCli([...example, '--help'])))
    examples.forEach((example, index) => {
      expect(readme).toContain(`releaser ${example.join(' ')}`)
      expect(results[index]?.exitCode).toBe(0)
    })
  })
})
