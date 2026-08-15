import { Command } from 'commander'
import { registerDoctorCommand } from './commands/doctor.js'
import { registerPlanCommand } from './commands/plan.js'
import { registerReleaseCommand } from './commands/release.js'
import { registerResumeCommand } from './commands/resume.js'
import { registerScanCommand } from './commands/scan.js'
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

  registerReleaseCommand(program)
  registerPlanCommand(program)
  registerStatusCommand(program)
  registerDoctorCommand(program)
  registerScanCommand(program)
  registerResumeCommand(program)

  return program
}
