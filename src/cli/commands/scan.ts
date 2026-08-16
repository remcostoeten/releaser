import type { Command } from 'commander'
import { scanRelease, type ReleaseCommandOptions } from '../release-service.js'

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Report occurrences of the current version in tracked files')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      const result = await scanRelease(options)
      console.log(options.json === true ? JSON.stringify(result) : JSON.stringify(result, null, 2))
    })
}
