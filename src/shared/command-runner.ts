import { execa } from 'execa'
import { CommandExecutionFailed, CommandFailed } from '../domain/errors.js'
import { defaultRedactor, type Redactor } from './redaction.js'

export type CommandOptions = {
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
  input?: string
}

export type CommandResult = {
  command: string
  args: string[]
  commandLine: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}

export type CommandRunner = {
  run(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>
  runOrThrow(command: string, args: string[], options?: CommandOptions): Promise<CommandResult>
}

export type CommandRunnerOptions = {
  redactor?: Redactor
}

function formatCommandLine(command: string, args: string[]): string {
  return [command, ...args].join(' ')
}

function redactArgs(args: string[], redactor: Redactor): string[] {
  return args.map((argument, index) => {
    const previous = args[index - 1]
    if (previous === '--otp') {
      return '[redacted]'
    }
    return redactor.redactText(argument)
  })
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function failureCode(error: unknown): string | null {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return null
}

/**
 * Creates the process-execution boundary. This is the only module permitted to
 * import `execa`; every other module receives a `CommandRunner`.
 *
 * `run` resolves for any process that ran to completion, including a non-zero
 * exit — the caller decides what a non-zero exit means. It throws only when the
 * process could not be started or was killed by the timeout. `runOrThrow`
 * additionally throws `CommandFailed` on a non-zero exit.
 *
 * Every captured stream, and the command line itself, is redacted before it is
 * returned. The originating error is deliberately not attached as a `cause`:
 * it carries the unredacted command line and captured output, which SPEC §14
 * forbids from reaching an error's details. Its `code` — `ENOENT`, `EACCES` —
 * is kept, because it is diagnostic and never secret.
 */
export function createCommandRunner(options: CommandRunnerOptions = {}): CommandRunner {
  const redactor = options.redactor ?? defaultRedactor

  async function run(
    command: string,
    args: string[],
    commandOptions: CommandOptions = {},
  ): Promise<CommandResult> {
    const startedAt = performance.now()
    const commandLine = redactor.redactText(formatCommandLine(command, args))

    try {
      const result = await execa(command, args, {
        ...(commandOptions.cwd === undefined ? {} : { cwd: commandOptions.cwd }),
        ...(commandOptions.env === undefined ? {} : { env: commandOptions.env }),
        ...(commandOptions.timeoutMs === undefined ? {} : { timeout: commandOptions.timeoutMs }),
        ...(commandOptions.input === undefined ? {} : { input: commandOptions.input }),
        reject: false,
        stripFinalNewline: false,
      })

      if (result.timedOut) {
        throw new CommandExecutionFailed(command, `timed out after ${commandOptions.timeoutMs}ms`, {
          commandLine,
        })
      }

      if (typeof result.exitCode !== 'number') {
        throw new CommandExecutionFailed(command, 'process terminated without an exit code', {
          commandLine,
          signal: result.signal ?? null,
        })
      }

      return {
        command,
        args: redactArgs(args, redactor),
        commandLine,
        exitCode: result.exitCode,
        stdout: redactor.redactText(String(result.stdout ?? '')),
        stderr: redactor.redactText(String(result.stderr ?? '')),
        durationMs: Math.round(performance.now() - startedAt),
      }
    } catch (error) {
      if (error instanceof CommandExecutionFailed) {
        throw error
      }
      throw new CommandExecutionFailed(command, redactor.redactText(describeFailure(error)), {
        commandLine,
        code: failureCode(error),
      })
    }
  }

  return {
    run,
    async runOrThrow(command, args, commandOptions): Promise<CommandResult> {
      const result = await run(command, args, commandOptions)
      if (result.exitCode !== 0) {
        throw new CommandFailed(result.commandLine, result.exitCode, result.stdout, result.stderr)
      }
      return result
    },
  }
}
