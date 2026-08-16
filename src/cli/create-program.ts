import { Command } from 'commander'
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
    .description('Safe, resumable npm and GitHub release CLI')
    .version(version, '-V, --cli-version', 'output the releaser version')
    .option('--bump <kind>', 'patch, minor, major, or prerelease')
    .option('--version <semver>', 'explicit target version')
    .option('--tag <dist-tag>', 'npm dist-tag to publish under')
    .option('--dry-run', 'perform no persistent writes')
    .option('--yes', 'accept every prompt')
    .option('--no-interactive', 'never prompt')
    .option('--json', 'machine-readable output on stdout')
    .option('--otp <code>', 'npm one-time password')
    .option('--cwd <path>', 'run against another directory')
    .option('--verbose', 'verbose logging')
    .showSuggestionAfterError(true)
    .addHelpText(
      'after',
      '\nCommon flows:\n  releaser ship --bump patch       Commit, merge, and release interactively\n  releaser --bump patch            Release the current branch\n  eval "$(releaser completion zsh)" Enable zsh completion',
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
