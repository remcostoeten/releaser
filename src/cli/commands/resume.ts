import * as prompts from '@clack/prompts'
import type { Command } from 'commander'
import { Cancelled } from '../../domain/errors.js'
import { resumeReleaseFromCli, type ReleaseCommandOptions } from '../release-service.js'

export function registerResumeCommand(program: Command): void {
  program
    .command('resume')
    .description('Continue an interrupted release from its journal')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as ReleaseCommandOptions & { json?: boolean }
      const canPrompt =
        process.stdin.isTTY === true && options.interactive !== false && options.json !== true
      const result = await resumeReleaseFromCli({
        ...options,
        interactive: canPrompt,
        requestOtp: async () => {
          const otp = await prompts.password({ message: 'npm one-time password' })
          if (prompts.isCancel(otp)) {
            throw new Cancelled()
          }
          return otp
        },
      })
      console.log(options.json === true ? JSON.stringify(result) : JSON.stringify(result, null, 2))
    })
}
