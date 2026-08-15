import type { Command } from 'commander'
import { reportNotImplemented } from '../not-implemented.js'

export function registerResumeCommand(program: Command): void {
  program
    .command('resume')
    .description('Continue an interrupted release from its journal')
    .action(() => {
      reportNotImplemented('resume')
    })
}
