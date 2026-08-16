import type { Command } from 'commander'
import { doctorRelease, type ReleaseCommandOptions } from '../release-service.js'

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run the preflight checks and report them')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      const result = await doctorRelease(options)
      console.log(options.json === true ? JSON.stringify(result) : JSON.stringify(result, null, 2))
    })
}
