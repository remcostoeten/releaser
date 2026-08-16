import * as prompts from '@clack/prompts'
import type { Command } from 'commander'
import { Cancelled, PreflightFailed } from '../../domain/errors.js'
import { renderPlanReport } from '../../ui/index.js'
import { planReportView } from '../command-reports.js'
import { createProgressReporter, renderExecutionResult } from '../execution-output.js'
import {
  executePlannedRelease,
  planRelease,
  type ReleaseCommandOptions,
} from '../release-service.js'
import { authorizePreflight } from '../preflight-overrides.js'
import { createCliOutputContext, type CliOutputOptions } from '../output-context.js'
import { inspectShip } from '../ship-service.js'
import { runShipWizard } from './ship.js'

type CliOptions = ReleaseCommandOptions & CliOutputOptions

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
  const initialOutput = createCliOutputContext(options)
  const canPrompt =
    process.stdin.isTTY === true &&
    options.yes !== true &&
    !initialOutput.json &&
    options.interactive !== false
  const selected = canPrompt ? await promptForSelection(options) : options
  const output = createCliOutputContext(selected)
  const planned = await planRelease(selected)
  if (!output.json) {
    console.log(renderPlanReport(planReportView(planned), output.stdout))
  }
  const acceptedOverrideCheckIds = await authorizePreflight(planned.checks, {
    yes: selected.yes === true,
    canPrompt,
    ...(canPrompt ? { confirmOverride } : {}),
  })
  if (planned.kind !== 'planned') {
    throw new PreflightFailed(planned.checks)
  }
  if (canPrompt) {
    const confirmed = await prompts.confirm({ message: 'Execute this immutable release plan?' })
    if (prompts.isCancel(confirmed) || !confirmed) {
      throw new Cancelled()
    }
  }
  const progress = createProgressReporter(output.json, output.stderr)
  const result = await executePlannedRelease(planned.plan, {
    ...selected,
    acceptedOverrideCheckIds,
    yes: selected.yes === true || canPrompt,
    interactive: canPrompt,
    onExecutionEvent: progress.onEvent,
    requestOtp: async () => {
      const otp = await prompts.password({ message: 'npm one-time password' })
      if (prompts.isCancel(otp)) {
        throw new Cancelled()
      }
      return otp
    },
  })
  console.log(
    output.json
      ? JSON.stringify(result)
      : renderExecutionResult(planned.plan, result, output.stdout),
  )
}

async function confirmOverride(message: string): Promise<boolean> {
  const answer = await prompts.confirm({ message })
  return !prompts.isCancel(answer) && answer
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
  const output = createCliOutputContext(options)
  return (
    process.stdin.isTTY === true &&
    options.yes !== true &&
    !output.json &&
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
