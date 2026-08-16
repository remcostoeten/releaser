import type { Command } from 'commander'
import { readReleaseStatus, type ReleaseCommandOptions } from '../release-service.js'

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Report the current repository, registry, and release state')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      const result = await readReleaseStatus(options)
      console.log(options.json === true ? JSON.stringify(result) : JSON.stringify(result, null, 2))
    })
}
