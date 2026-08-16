import { Command, Option } from 'commander'
import { UsageError } from '../domain/errors.js'
import { registerCompletionCommand } from './commands/completion.js'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerFinalizeCommand } from './commands/finalize.js'
import { registerPlanCommand } from './commands/plan.js'
import { registerReleaseCommand } from './commands/release.js'
import { registerResumeCommand } from './commands/resume.js'
import { registerScanCommand } from './commands/scan.js'
import { registerShipCommand } from './commands/ship.js'
import { registerStatusCommand } from './commands/status.js'

export function createProgram(version: string): Command {
  const program = new Command()

  program
    .name('releaser')
    .description(
      'Safe, resumable npm and GitHub release CLI. Run without a command to start the release wizard.',
    )
    .version(version, '-V, --cli-version', 'output the releaser version')
    .addOption(
      new Option(
        '--bump <kind>',
        'release increment: patch, minor, major, or prerelease',
      ).argParser(parseBump),
    )
    .option('--version <semver>', 'explicit target version')
    .option('--tag <dist-tag>', 'npm dist-tag to publish under')
    .option('--dry-run', 'perform no persistent writes')
    .option('--yes', 'approve prompts and overridable checks; never bypass hard blockers')
    .option('--no-interactive', 'never prompt')
    .option('--json', 'write one machine-readable JSON value to stdout; progress uses stderr')
    .option('--otp <code>', 'sensitive npm one-time password; pass only when required')
    .option('--cwd <path>', 'run against another directory')
    .option('--verbose', 'include diagnostics and error stacks')
    .configureHelp({ showGlobalOptions: true })
    .showSuggestionAfterError(true)
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  releaser --bump patch                 Plan, confirm, and release',
        '  releaser plan --bump minor            Preview without executing',
        '  releaser --bump patch --dry-run       Exercise checks with zero writes',
        '  releaser ship --bump patch            Commit, merge, and release',
        '  releaser resume                       Continue an interrupted release',
        '  releaser status --json | jq .         Keep stdout machine-readable',
        '  eval "$(releaser completion zsh)"     Enable zsh completion',
      ].join('\n'),
    )

  registerReleaseCommand(program)
  registerPlanCommand(program)
  registerStatusCommand(program)
  registerDoctorCommand(program)
  registerScanCommand(program)
  registerResumeCommand(program)
  registerShipCommand(program)
  registerFinalizeCommand(program)
  registerCompletionCommand(program)

  return program
}

function parseBump(value: string): string {
  if (value === 'patch' || value === 'minor' || value === 'major' || value === 'prerelease') {
    return value
  }
  throw new UsageError(
    `Invalid --bump value ${JSON.stringify(value)}; expected patch, minor, major, or prerelease.`,
  )
}
