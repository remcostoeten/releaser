import type {
  CommandOptions,
  CommandResult,
  CommandRunner,
} from '../../src/shared/command-runner.js'
import { CommandFailed } from '../../src/domain/errors.js'

export type RecordedCommand = {
  command: string
  args: string[]
  options: CommandOptions
}

export type StubbedResponse = {
  exitCode?: number
  stdout?: string
  stderr?: string
}

export type FakeCommandRunner = CommandRunner & {
  readonly calls: RecordedCommand[]
  stub(match: string, response: StubbedResponse): void
  commandLines(): string[]
}

function keyOf(command: string, args: string[]): string {
  return [command, ...args].join(' ')
}

export function createFakeCommandRunner(): FakeCommandRunner {
  const calls: RecordedCommand[] = []
  const stubs = new Map<string, StubbedResponse>()

  function findStub(line: string): StubbedResponse | undefined {
    for (const [match, response] of stubs) {
      if (line === match || line.startsWith(match)) {
        return response
      }
    }
    return undefined
  }

  async function run(
    command: string,
    args: string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    calls.push({ command, args, options })

    const commandLine = keyOf(command, args)
    const stub = findStub(commandLine)

    return {
      command,
      args,
      commandLine,
      exitCode: stub?.exitCode ?? 0,
      stdout: stub?.stdout ?? '',
      stderr: stub?.stderr ?? '',
      durationMs: 0,
    }
  }

  return {
    calls,
    stub(match, response): void {
      stubs.set(match, response)
    },
    commandLines(): string[] {
      return calls.map((call) => keyOf(call.command, call.args))
    },
    run,
    async runOrThrow(command, args, options): Promise<CommandResult> {
      const result = await run(command, args, options)
      if (result.exitCode !== 0) {
        throw new CommandFailed(result.commandLine, result.exitCode, result.stdout, result.stderr)
      }
      return result
    },
    async readSecret(command, args, options): Promise<string | null> {
      const result = await run(command, args, options)
      return result.exitCode === 0 && result.stdout.trim().length > 0 ? result.stdout.trim() : null
    },
  }
}
