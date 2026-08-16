import type { Command } from 'commander'
import { renderPlanReport } from '../../ui/index.js'
import { planReportView } from '../command-reports.js'
import { createCliOutputContext } from '../output-context.js'
import { planRelease, type ReleaseCommandOptions } from '../release-service.js'

export function registerPlanCommand(program: Command): void {
  program
    .command('plan')
    .description('Build and display a release plan; execute nothing')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      const result = await planRelease(options)
      console.log(
        options.json === true
          ? JSON.stringify(result)
          : renderPlanReport(planReportView(result), createCliOutputContext(options).stdout),
      )
    })
}
