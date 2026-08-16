import type { Command } from 'commander'
import { renderProgressEvent, renderSuccessSummary } from '../../ui/index.js'
import { finalizeReleaseFromCli, type FinalizeCommandOptions } from '../finalize-service.js'
import { createCliOutputContext, type CliOutputOptions } from '../output-context.js'

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
      const options = command.optsWithGlobals() as FinalizeCommandOptions & CliOutputOptions
      const output = createCliOutputContext(options)
      const result = await finalizeReleaseFromCli({
        ...options,
        ...(tag === undefined ? {} : { tag }),
      })
      if (output.json) {
        console.log(JSON.stringify(result))
        return
      }
      console.error(
        renderProgressEvent(
          {
            position: null,
            label: 'Publish GitHub Release',
            status: result.kind === 'already-published' ? 'verified' : 'completed',
          },
          output.stderr,
        ),
      )
      console.log(
        renderSuccessSummary(
          {
            title:
              result.kind === 'already-published'
                ? `Release ${result.release.tag} already published`
                : `Published release ${result.release.tag}`,
            rows: [
              { label: 'Tag', value: result.release.tag },
              { label: 'GitHub Release', value: result.release.url },
            ],
          },
          output.stdout,
        ),
      )
    })
}
