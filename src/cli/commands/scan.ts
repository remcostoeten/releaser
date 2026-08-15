import type { Command } from 'commander'
import { reportNotImplemented } from '../not-implemented.js'

export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Report occurrences of the current version in tracked files')
    .action(() => {
      reportNotImplemented('scan')
    })
}
