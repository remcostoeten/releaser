import type { Command } from 'commander'
import { blockingChecks } from '../../domain/checks.js'
import { renderDoctorReport } from '../../ui/index.js'
import { doctorReportView } from '../command-reports.js'
import { EXIT_CODES } from '../exit-codes.js'
import { createCliOutputContext } from '../output-context.js'
import { doctorRelease, type ReleaseCommandOptions } from '../release-service.js'

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Run the preflight checks and report them')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      const result = await doctorRelease(options)
      console.log(
        options.json === true
          ? JSON.stringify(result)
          : renderDoctorReport(
              doctorReportView(result.checks),
              createCliOutputContext(options).stdout,
            ),
      )
      if (blockingChecks(result.checks).length > 0) {
        process.exitCode = EXIT_CODES.preflightFailed
      }
    })
}
