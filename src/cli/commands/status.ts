import type { Command } from 'commander'
import { renderStatusReport } from '../../ui/index.js'
import { statusReportView } from '../command-reports.js'
import { createCliOutputContext } from '../output-context.js'
import { readReleaseStatus, type ReleaseCommandOptions } from '../release-service.js'
import { readHumanReleaseStatus } from '../status-service.js'

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Report the current repository, registry, and release state')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      if (options.json === true) {
        console.log(JSON.stringify(await readReleaseStatus(options)))
        return
      }
      const result = await readHumanReleaseStatus(options)
      console.log(
        renderStatusReport(statusReportView(result), createCliOutputContext(options).stdout),
      )
    })
}
