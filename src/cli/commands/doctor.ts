import type { Command } from 'commander'
import { reportNotImplemented } from '../not-implemented.js'

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run the preflight checks and report them')
    .action(() => {
      reportNotImplemented('doctor')
    })
}
