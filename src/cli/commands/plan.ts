import type { Command } from 'commander'
import { reportNotImplemented } from '../not-implemented.js'

export function registerPlanCommand(program: Command): void {
  program
    .command('plan')
    .description('Build and display a release plan; execute nothing')
    .action(() => {
      reportNotImplemented('plan')
    })
}
