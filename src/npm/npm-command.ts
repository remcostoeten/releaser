import type { CommandResult, CommandRunner } from '../shared/command-runner.js'

export type NpmCommand = {
  cwd: string
  run(args: string[]): Promise<CommandResult>
}

const NPM_ENV = {
  LC_ALL: 'C',
  NPM_CONFIG_COLOR: 'false',
  NPM_CONFIG_PROGRESS: 'false',
}

export function createNpmCommand(runner: CommandRunner, cwd: string): NpmCommand {
  return {
    cwd,
    run(args): Promise<CommandResult> {
      return runner.run('npm', args, { cwd, env: NPM_ENV })
    },
  }
}
