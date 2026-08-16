import * as prompts from '@clack/prompts'
import type { Command } from 'commander'
import { Cancelled } from '../../domain/errors.js'
import type { ReleasePlan } from '../../domain/release-plan.js'
import { resumeReleaseFromCli, type ReleaseCommandOptions } from '../release-service.js'
import { createCliOutputContext, type CliOutputOptions } from '../output-context.js'
import { createProgressReporter, renderExecutionResult } from '../execution-output.js'

export function registerResumeCommand(program: Command): void {
  program
    .command('resume')
    .description('Continue an interrupted release from its journal')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & CliOutputOptions
      const output = createCliOutputContext(options)
      const canPrompt =
        process.stdin.isTTY === true && options.interactive !== false && !output.json
      const progress = createProgressReporter(output.json, output.stderr)
      let plan: ReleasePlan | null = null
      const result = await resumeReleaseFromCli({
        ...options,
        interactive: canPrompt,
        onExecutionEvent: progress.onEvent,
        onResumePlan: (value) => {
          plan = value
        },
        requestOtp: async () => {
          const otp = await prompts.password({ message: 'npm one-time password' })
          if (prompts.isCancel(otp)) {
            throw new Cancelled()
          }
          return otp
        },
      })
      if (output.json) {
        console.log(JSON.stringify(result))
        return
      }
      if (plan === null) {
        throw new Error('Resume plan was not loaded')
      }
      console.log(renderExecutionResult(plan, result, output.stdout, true))
    })
}
