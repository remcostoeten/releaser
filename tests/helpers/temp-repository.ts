import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createCommandRunner, type CommandRunner } from '../../src/shared/command-runner.js'

const AUTHOR = { name: 'Releaser Test', email: 'test@example.invalid' }
const FIXED_DATE = '2024-01-01T00:00:00+00:00'

const DETERMINISTIC_ENV = {
  GIT_AUTHOR_NAME: AUTHOR.name,
  GIT_AUTHOR_EMAIL: AUTHOR.email,
  GIT_COMMITTER_NAME: AUTHOR.name,
  GIT_COMMITTER_EMAIL: AUTHOR.email,
  GIT_AUTHOR_DATE: FIXED_DATE,
  GIT_COMMITTER_DATE: FIXED_DATE,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  LC_ALL: 'C',
}

export type TempRepository = {
  root: string
  originPath: string | null
  runner: CommandRunner
  git(args: string[], cwd?: string): Promise<string>
  write(relativePath: string, content: string): Promise<void>
  commit(message: string, files?: Record<string, string>): Promise<string>
  head(): Promise<string>
  cleanup(): Promise<void>
}

async function createWorkspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'releaser-git-'))
}

export type TempRepositoryOptions = {
  withOrigin?: boolean
  branch?: string
}

/**
 * Creates a throwaway repository in the OS temp directory, optionally with a
 * local bare repository standing in for `origin`. Author, committer and dates
 * are pinned so commit SHAs are reproducible across runs and machines, and the
 * global and system Git configs are detached so a developer's own settings
 * cannot change a test's outcome.
 */
export async function createTempRepository(
  options: TempRepositoryOptions = {},
): Promise<TempRepository> {
  const workspace = await createWorkspace()
  const root = join(workspace, 'repo')
  const originPath = options.withOrigin === true ? join(workspace, 'origin.git') : null
  const branch = options.branch ?? 'main'
  const runner = createCommandRunner()

  async function git(args: string[], cwd: string = root): Promise<string> {
    const result = await runner.runOrThrow('git', args, { cwd, env: DETERMINISTIC_ENV })
    return result.stdout.trim()
  }

  await mkdir(root, { recursive: true })
  await git(['init', `--initial-branch=${branch}`], root)
  await git(['config', 'user.name', AUTHOR.name])
  await git(['config', 'user.email', AUTHOR.email])
  await git(['config', 'commit.gpgsign', 'false'])
  await git(['config', 'tag.gpgsign', 'false'])

  if (originPath !== null) {
    await mkdir(originPath, { recursive: true })
    await git(['init', '--bare', `--initial-branch=${branch}`], originPath)
    await git(['remote', 'add', 'origin', originPath])
  }

  async function write(relativePath: string, content: string): Promise<void> {
    const target = join(root, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }

  return {
    root,
    originPath,
    runner,
    git,
    write,
    async commit(message, files = {}): Promise<string> {
      await Promise.all(Object.entries(files).map(([path, content]) => write(path, content)))
      await git(['add', '--all'])
      await git(['commit', '--message', message, '--allow-empty'])
      return git(['rev-parse', 'HEAD'])
    },
    head(): Promise<string> {
      return git(['rev-parse', 'HEAD'])
    },
    cleanup(): Promise<void> {
      return rm(workspace, { recursive: true, force: true })
    },
  }
}
