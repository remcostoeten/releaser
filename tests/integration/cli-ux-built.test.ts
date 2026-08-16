import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTempRepository, type TempRepository } from '../helpers/temp-repository.js'

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const CLI_ENTRY = join(PROJECT_ROOT, 'dist/cli/index.js')
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
const ANSI_ESCAPE = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'u')

let repository: TempRepository

beforeAll(async () => {
  await execa('bun', ['run', 'build'], { cwd: PROJECT_ROOT })
})

beforeEach(async () => {
  repository = await createTempRepository({ withOrigin: true })
  await repository.commit('feat: initial release', {
    'package.json': `${JSON.stringify(
      { name: 'built-cli-fixture', version: '0.1.0', type: 'module' },
      null,
      2,
    )}\n`,
    'README.md': 'Current version: 0.1.0\n',
    'releaser.config.json': `${JSON.stringify(
      { npm: { publish: false }, github: { release: false } },
      null,
      2,
    )}\n`,
  })
  await repository.git(['push', '--set-upstream', 'origin', 'main'])
  await repository.git(
    ['symbolic-ref', 'HEAD', 'refs/heads/main'],
    repository.originPath ?? undefined,
  )
})

afterEach(async () => {
  await repository.cleanup()
})

function runCli(
  arguments_: readonly string[],
  environment: Record<string, string | undefined> = {},
) {
  return execa('node', [CLI_ENTRY, ...arguments_], {
    cwd: PROJECT_ROOT,
    env: {
      XDG_STATE_HOME: join(dirname(repository.root), 'state'),
      ...environment,
    },
    reject: false,
  })
}

function expectSingleJsonValue(output: string): unknown {
  const parsed: unknown = JSON.parse(output)
  expect(JSON.stringify(parsed)).toBe(output)
  return parsed
}

function waitForText(
  stream: NodeJS.ReadableStream,
  expected: string,
  timeoutMs = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${JSON.stringify(expected)}`))
    }, timeoutMs)
    stream.on('data', (chunk: Buffer | string) => {
      if (String(chunk).includes(expected)) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })
}

describe('built Node CLI command surface', () => {
  it('renders root and every command help', async () => {
    const results = await Promise.all([
      runCli(['--help']),
      ...COMMANDS.map((command) => runCli([command, '--help'])),
    ])

    for (const result of results) {
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('--verbose')
      expect(result.stderr).toBe('')
    }
  })

  it.each(['bash', 'zsh', 'fish'])('renders deterministic %s completion', async (shell) => {
    const first = await runCli(['completion', shell])
    const second = await runCli(['completion', shell])

    expect(first.exitCode).toBe(0)
    expect(first.stdout).toBe(second.stdout)
    for (const command of COMMANDS) {
      expect(first.stdout).toContain(command)
    }
  })

  it('accepts global options around commands and rejects invalid values', async () => {
    const before = await runCli(['--cwd', repository.root, 'scan', '--json'])
    const after = await runCli(['scan', '--cwd', repository.root, '--json'])
    const invalid = await runCli(['plan', '--bump', 'breaking', '--cwd', repository.root])

    expect(before.exitCode).toBe(0)
    expect(after.exitCode).toBe(0)
    expect(before.stdout).toBe(after.stdout)
    expect(invalid.exitCode).toBe(2)
    expect(invalid.stderr).toContain('expected patch, minor, major, or prerelease')
  })
})

describe('built Node CLI reports', () => {
  it('renders plan, status, doctor, and scan as human reports without ANSI', async () => {
    const [plan, status, doctor, scan] = await Promise.all([
      runCli(['plan', '--bump', 'patch', '--cwd', repository.root]),
      runCli(['status', '--cwd', repository.root]),
      runCli(['doctor', '--bump', 'patch', '--cwd', repository.root]),
      runCli(['scan', '--cwd', repository.root]),
    ])

    expect(plan.exitCode).toBe(0)
    expect(plan.stdout).toContain('0.1.0 -> 0.1.1')
    expect(plan.stdout).toContain('--- a/package.json')
    expect(plan.stdout).toContain('Plan created in read-only mode. No repository changes made.')
    expect(status.stdout).toContain('Package       built-cli-fixture')
    expect(status.stdout).toContain('Version       0.1.0')
    expect(status.stdout).toContain('Upstream      origin/main')
    expect(status.stdout).toContain('npm publication is disabled')
    expect(doctor.stdout).toContain('Preflight doctor')
    expect(scan.stdout).toContain('README.md:1:18')
    for (const result of [plan, status, doctor, scan]) {
      expect(result.exitCode).toBe(0)
      expect(result.stdout).not.toMatch(ANSI_ESCAPE)
      expect(result.stdout).not.toContain('schemaVersion')
      expect(result.stdout).not.toContain('statusDigest')
      expect(result.stdout).not.toContain('"offset"')
    }
  })

  it('emits exactly one JSON value for every report', async () => {
    const argumentSets = [
      ['plan', '--bump', 'patch'],
      ['status'],
      ['doctor', '--bump', 'patch'],
      ['scan'],
    ]
    const results = await Promise.all(
      argumentSets.map((args) => runCli([...args, '--json', '--cwd', repository.root])),
    )

    for (const result of results) {
      expect(result.exitCode).toBe(0)
      expectSingleJsonValue(result.stdout)
      expect(result.stderr).toBe('')
    }
  })

  it('keeps colour disabled when NO_COLOR is present', async () => {
    const result = await runCli(['plan', '--bump', 'patch', '--cwd', repository.root], {
      NO_COLOR: '1',
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toMatch(ANSI_ESCAPE)
    expect(result.stderr).not.toMatch(ANSI_ESCAPE)
  })
})

describe('built Node CLI safety and execution', () => {
  it('blocks non-overridable preflight failures under --yes without mutation or prompt', async () => {
    const withoutOrigin = await createTempRepository()
    try {
      await withoutOrigin.commit('feat: no remote', {
        'package.json': '{"name":"no-origin","version":"0.1.0"}\n',
        'releaser.config.json': '{"npm":{"publish":false},"github":{"release":false}}\n',
      })
      const head = await withoutOrigin.head()
      const result = await runCli(['--bump', 'patch', '--yes', '--cwd', withoutOrigin.root])

      expect(result.exitCode).toBe(3)
      expect(result.stderr).toContain('Preflight blocked')
      expect(result.stdout).not.toContain('Execute this immutable release plan?')
      expect(await withoutOrigin.head()).toBe(head)
      expect(await withoutOrigin.git(['status', '--porcelain=v1'])).toBe('')
    } finally {
      await withoutOrigin.cleanup()
    }
  })

  it('executes real Git stages and reports all seven normative stages', async () => {
    const result = await runCli(['--bump', 'patch', '--yes', '--cwd', repository.root])

    expect(result.exitCode).toBe(0)
    for (const label of [
      'Mutate files',
      'Create release commit',
      'Create annotated tag',
      'Push branch',
      'Push tag',
      'Publish to npm',
      'Create GitHub Release',
    ]) {
      expect(result.stderr).toContain(label)
    }
    expect(result.stdout).toContain('Released built-cli-fixture@0.1.1')
    expect(await repository.git(['describe', '--tags', '--exact-match'])).toBe('v0.1.1')
    expect(await repository.git(['status', '--porcelain=v1'])).toBe('')
    expect(await repository.git(['rev-parse', 'main'])).toBe(
      await repository.git(['rev-parse', 'refs/remotes/origin/main']),
    )
  })

  it('keeps dry-run free of repository and journal writes', async () => {
    const head = await repository.head()
    const manifest = await readFile(join(repository.root, 'package.json'), 'utf8')
    const result = await runCli(['--bump', 'patch', '--dry-run', '--yes', '--cwd', repository.root])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('nothing was written')
    expect(await repository.head()).toBe(head)
    expect(await readFile(join(repository.root, 'package.json'), 'utf8')).toBe(manifest)
    expect(await repository.git(['tag', '--list'])).toBe('')
    expect(await repository.git(['status', '--porcelain=v1'])).toBe('')
    await expect(stat(join(dirname(repository.root), 'state'))).rejects.toThrow()
  })

  it('keeps JSON stdout pure and secrets absent from output and journal', async () => {
    const secrets = {
      github: 'github_test_secret_123456789',
      npm: 'npm_test_secret_123456789',
      otp: '918273',
    }
    const result = await runCli(
      ['--bump', 'patch', '--yes', '--json', '--otp', secrets.otp, '--cwd', repository.root],
      { GITHUB_TOKEN: secrets.github, NPM_TOKEN: secrets.npm },
    )

    expect(result.exitCode).toBe(0)
    const value = expectSingleJsonValue(result.stdout) as { journalPath: string }
    const visible = `${result.stdout}\n${result.stderr}`
    for (const secret of Object.values(secrets)) {
      expect(visible).not.toContain(secret)
    }
    const journal = await readFile(value.journalPath, 'utf8')
    for (const secret of Object.values(secrets)) {
      expect(journal).not.toContain(secret)
    }
  })

  it('exits 5 with recovery guidance when interrupted after journalled stage intent', async () => {
    const binaryDirectory = join(dirname(repository.root), 'bin')
    const gitWrapper = join(binaryDirectory, 'git')
    await mkdir(binaryDirectory)
    await writeFile(
      gitWrapper,
      '#!/bin/sh\ncase " $* " in *" commit "*) sleep 10;; esac\nexec /usr/bin/git "$@"\n',
      'utf8',
    )
    await chmod(gitWrapper, 0o755)
    const child = execa('node', [CLI_ENTRY, '--bump', 'patch', '--yes', '--cwd', repository.root], {
      cwd: PROJECT_ROOT,
      env: {
        PATH: `${binaryDirectory}:${process.env.PATH ?? ''}`,
        XDG_STATE_HOME: join(dirname(repository.root), 'state'),
      },
      reject: false,
    })
    if (child.stderr === null) {
      throw new Error('Expected child stderr stream')
    }
    await waitForText(child.stderr, 'Create release commit')
    child.kill('SIGINT')
    const result = await child

    expect(result.exitCode).toBe(5)
    expect(result.stderr).toContain('Release interrupted.')
    expect(result.stderr).toContain('releaser resume --cwd')
    expect(await repository.git(['log', '-1', '--format=%s'])).toBe('feat: initial release')
  })
})
