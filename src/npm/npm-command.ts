import type { CommandResult, CommandRunner } from '../shared/command-runner.js'

export type NpmCommand = {
  run(args: string[], cwd: string): Promise<CommandResult>
}

export function createNpmCommand(runner: CommandRunner): NpmCommand {
  return {
    run(args, cwd): Promise<CommandResult> {
      return runner.run('npm', args, { cwd })
    },
  }
}

export function commandOutput(result: CommandResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
}
