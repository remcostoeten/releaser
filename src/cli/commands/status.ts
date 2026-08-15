import type { Command } from 'commander'
import { reportNotImplemented } from '../not-implemented.js'

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Report the current repository, registry, and release state')
    .action(() => {
      reportNotImplemented('status')
    })
}
