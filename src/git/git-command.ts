import type { CommandResult, CommandRunner } from '../shared/command-runner.js'

export type GitCommand = {
  cwd: string
  run(args: string[]): Promise<CommandResult>
  runOrThrow(args: string[]): Promise<CommandResult>
  readText(args: string[]): Promise<string | null>
}

const GIT_ENV = {
  LC_ALL: 'C',
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
}

/**
 * Binds a `CommandRunner` to one repository directory and to an environment that
 * keeps Git's output machine-stable: `LC_ALL=C` so messages are not localized,
 * and `GIT_TERMINAL_PROMPT=0` so a missing credential fails instead of blocking
 * on a terminal prompt no caller is watching.
 *
 * `readText` returns the trimmed stdout of a successful command, and `null` for
 * any non-zero exit — Git uses exit codes to answer questions, and the common
 * ones ("no upstream", "not a tag") are answers rather than faults.
 */
export function createGitCommand(runner: CommandRunner, cwd: string): GitCommand {
  return {
    cwd,
    run(args): Promise<CommandResult> {
      return runner.run('git', args, { cwd, env: GIT_ENV })
    },
    runOrThrow(args): Promise<CommandResult> {
      return runner.runOrThrow('git', args, { cwd, env: GIT_ENV })
    },
    async readText(args): Promise<string | null> {
      const result = await runner.run('git', args, { cwd, env: GIT_ENV })
      if (result.exitCode !== 0) {
        return null
      }
      return result.stdout.trim()
    },
  }
}

export function splitNulSeparated(output: string): string[] {
  return output.split('\0').filter((entry) => entry.length > 0)
}

export function splitLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}
