import type { Command } from 'commander'
import { reportNotImplemented } from '../not-implemented.js'

export function registerReleaseCommand(program: Command): void {
  program.action(() => {
    reportNotImplemented('release')
  })
}
