import type { Command } from 'commander'
import { planRelease, type ReleaseCommandOptions } from '../release-service.js'

export function registerPlanCommand(program: Command): void {
  program
    .command('plan')
    .description('Build and display a release plan; execute nothing')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      const result = await planRelease(options)
      console.log(options.json === true ? JSON.stringify(result) : JSON.stringify(result, null, 2))
    })
}
