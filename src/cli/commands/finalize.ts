import type { Command } from 'commander'
import { finalizeReleaseFromCli, type FinalizeCommandOptions } from '../finalize-service.js'

export function registerFinalizeCommand(program: Command): void {
  program
    .command('finalize [tag]')
    .description(
      'Wait for the workflow runs on a release tag, then publish its draft GitHub release',
    )
    .option('--no-wait', 'publish immediately without waiting for workflow runs')
    .option('--poll <seconds>', 'seconds between workflow-run polls', '30')
    .option('--timeout <minutes>', 'minutes to wait before giving up', '45')
    .action(async (tag: string | undefined, _options, command) => {
      const options = command.optsWithGlobals() as FinalizeCommandOptions & { json?: boolean }
      const result = await finalizeReleaseFromCli({
        ...options,
        ...(tag === undefined ? {} : { tag }),
      })
      if (options.json === true) {
        console.log(JSON.stringify(result))
        return
      }
      console.log(
        result.kind === 'already-published'
          ? `Release ${result.release.tag} is already published: ${result.release.url}`
          : `Published release ${result.release.tag}: ${result.release.url}`,
      )
    })
}
