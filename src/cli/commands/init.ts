import type { Command } from 'commander'
import { renderKeyValueRows, renderSuccessSummary, type OutputEnvironment } from '../../ui/index.js'
import { createCliOutputContext } from '../output-context.js'
import { initRelease, type InitCommandOptions, type InitResult } from '../init-service.js'

type CliOptions = InitCommandOptions & { json?: boolean; verbose?: boolean }

function renderInitResult(result: InitResult, environment: OutputEnvironment): string {
  if (result.kind === 'no-config-needed') {
    return renderKeyValueRows([{ label: 'Result', value: result.reason }], environment)
  }

  if (result.kind === 'already-configured') {
    return renderKeyValueRows(
      [
        { label: 'Result', value: `${result.configPath} already exists; nothing written.` },
        { label: 'Hint', value: 'Pass --force to overwrite it.' },
      ],
      environment,
    )
  }

  return renderSuccessSummary(
    {
      title: result.dryRun
        ? 'Init dry run — nothing was written'
        : 'releaser.config.json generated',
      rows: [
        { label: 'Detected', value: result.summary },
        { label: 'Config', value: result.configPath },
        ...(result.versionFilePath === null
          ? []
          : [{ label: 'Version file', value: result.versionFilePath }]),
      ],
      skipped: result.dryRun ? ['files will be written on a real run'] : [],
    },
    environment,
  )
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Detect a non-npm project and generate releaser.config.json for it')
    .option('--force', 'overwrite an existing releaser.config.json')
    .action(async (localOptions, command) => {
      const options = { ...command.optsWithGlobals(), ...localOptions } as CliOptions
      const result = await initRelease(options)
      const output = createCliOutputContext(options)

      if (output.json) {
        console.log(JSON.stringify(result))
        return
      }

      console.log(renderInitResult(result, output.stdout))
      if (result.kind === 'initialized' && !result.dryRun) {
        console.log('Next: run `releaser doctor` to verify the new configuration.')
      }
    })
}
