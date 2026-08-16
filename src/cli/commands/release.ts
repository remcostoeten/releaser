import * as prompts from '@clack/prompts'
import type { Command } from 'commander'
import { isBlocked, unoverridableBlockers } from '../../domain/checks.js'
import { Cancelled, PreflightFailed } from '../../domain/errors.js'
import {
  executePlannedRelease,
  planRelease,
  type ReleaseCommandOptions,
} from '../release-service.js'
import { inspectShip } from '../ship-service.js'
import { runShipWizard } from './ship.js'

type CliOptions = ReleaseCommandOptions & {
  json?: boolean
}

async function promptForSelection(options: CliOptions): Promise<CliOptions> {
  if (options.bump !== undefined || options.version !== undefined) {
    return options
  }
  const selected = await prompts.select({
    message: 'Choose the release type',
    options: [
      { value: 'patch', label: 'Patch' },
      { value: 'minor', label: 'Minor' },
      { value: 'major', label: 'Major' },
      { value: 'prerelease', label: 'Prerelease' },
    ],
  })
  if (prompts.isCancel(selected)) {
    throw new Cancelled()
  }
  return { ...options, bump: selected }
}

async function runWizard(options: CliOptions): Promise<void> {
  const canPrompt =
    process.stdin.isTTY === true &&
    options.yes !== true &&
    options.json !== true &&
    options.interactive !== false
  const selected = canPrompt ? await promptForSelection(options) : options
  const planned = await planRelease(selected)
  if (planned.kind !== 'planned') {
    throw new PreflightFailed(planned.checks)
  }
  if (
    unoverridableBlockers(planned.checks).length > 0 ||
    (isBlocked(planned.checks) && selected.yes !== true && !canPrompt)
  ) {
    throw new PreflightFailed(planned.checks)
  }
  if (selected.json !== true) {
    console.log(JSON.stringify(planned, null, 2))
  }
  if (canPrompt) {
    const confirmed = await prompts.confirm({ message: 'Execute this immutable release plan?' })
    if (prompts.isCancel(confirmed) || !confirmed) {
      throw new Cancelled()
    }
  }
  const result = await executePlannedRelease(planned.plan, {
    ...selected,
    yes: selected.yes === true || canPrompt,
    interactive: canPrompt,
    requestOtp: async () => {
      const otp = await prompts.password({ message: 'npm one-time password' })
      if (prompts.isCancel(otp)) {
        throw new Cancelled()
      }
      return otp
    },
  })
  console.log(selected.json === true ? JSON.stringify(result) : JSON.stringify(result, null, 2))
}

export function registerReleaseCommand(program: Command): void {
  program
    .command('release', { isDefault: true, hidden: true })
    .description('Run the interactive or non-interactive release workflow')
    .action(async (_options, command) => {
      const options = command.optsWithGlobals() as CliOptions
      const interactive = canPromptForRoot(options)
      if (interactive && (await wantsToShip(options))) {
        await runShipWizard(options)
        return
      }
      await runWizard(options)
    })
}

function canPromptForRoot(options: CliOptions): boolean {
  return (
    process.stdin.isTTY === true &&
    options.yes !== true &&
    options.json !== true &&
    options.interactive !== false
  )
}

async function wantsToShip(options: CliOptions): Promise<boolean> {
  const context = await inspectShip(options)
  if (context.sourceBranch === context.targetBranch) {
    return false
  }
  const workflow = await prompts.select({
    message: `You are on ${context.sourceBranch}. What do you want to do?`,
    options: [
      {
        value: 'ship',
        label: `Ship to ${context.targetBranch}`,
        hint: 'commit, merge, then release',
      },
      { value: 'release', label: 'Release current branch' },
    ],
  })
  if (prompts.isCancel(workflow)) {
    throw new Cancelled()
  }
  return workflow === 'ship'
}
