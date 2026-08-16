import * as prompts from '@clack/prompts'
import type { Command } from 'commander'
import { isBlocked, unoverridableBlockers } from '../../domain/checks.js'
import {
  Cancelled,
  CancelledAfterPreparation,
  PreflightFailed,
  UsageError,
} from '../../domain/errors.js'
import type { ShipPlan } from '../../domain/ship-plan.js'
import {
  executePlannedRelease,
  planRelease,
  type ReleaseCommandOptions,
} from '../release-service.js'
import { inspectShip, planShip, prepareShip, type ShipCommandOptions } from '../ship-service.js'

type CliOptions = ShipCommandOptions & { json?: boolean }

function canPrompt(options: CliOptions): boolean {
  return (
    process.stdin.isTTY === true &&
    options.yes !== true &&
    options.json !== true &&
    options.interactive !== false
  )
}

async function selectVersion(options: CliOptions): Promise<CliOptions> {
  if (options.bump !== undefined || options.version !== undefined) {
    return options
  }
  const bump = await prompts.select({
    message: 'Choose the release type',
    options: [
      { value: 'patch', label: 'Patch' },
      { value: 'minor', label: 'Minor' },
      { value: 'major', label: 'Major' },
      { value: 'prerelease', label: 'Prerelease' },
    ],
  })
  if (prompts.isCancel(bump)) {
    throw new Cancelled()
  }
  return { ...options, bump }
}

async function completeShipOptions(options: CliOptions): Promise<CliOptions> {
  const context = await inspectShip(options)
  let completed = options
  if (context.changes.length > 0 && options.message === undefined) {
    const message = await prompts.text({
      message: 'Feature commit message',
      placeholder: 'feat: describe this change',
      validate: (value) =>
        value === undefined || value.trim().length === 0
          ? 'A commit message is required'
          : undefined,
    })
    if (prompts.isCancel(message)) {
      throw new Cancelled()
    }
    completed = { ...completed, message }
  }
  return selectVersion(completed)
}

async function confirm(message: string): Promise<void> {
  const accepted = await prompts.confirm({ message })
  if (prompts.isCancel(accepted) || !accepted) {
    throw new Cancelled()
  }
}

function assertReleaseCanExecute(
  result: Awaited<ReturnType<typeof planRelease>>,
  allowOverrides: boolean,
): asserts result is Extract<Awaited<ReturnType<typeof planRelease>>, { kind: 'planned' }> {
  if (
    result.kind !== 'planned' ||
    unoverridableBlockers(result.checks).length > 0 ||
    (isBlocked(result.checks) && !allowOverrides)
  ) {
    throw new PreflightFailed(result.checks)
  }
}

function assertShipReleaseReady(
  result: Awaited<ReturnType<typeof planRelease>>,
): asserts result is Extract<Awaited<ReturnType<typeof planRelease>>, { kind: 'planned' }> {
  if (result.kind !== 'planned' || unoverridableBlockers(result.checks).length > 0) {
    throw new PreflightFailed(result.checks)
  }
}

function renderPreparation(
  options: CliOptions,
  plan: ShipPlan,
  readiness: Extract<Awaited<ReturnType<typeof planRelease>>, { kind: 'planned' }>,
  dryRun: boolean,
): void {
  const value = {
    kind: dryRun ? 'ship-dry-run' : 'ship-preparation',
    preparation: plan,
    releaseReadiness: readiness.checks,
    provisionalVersion: readiness.plan.version.nextVersion,
    ...(dryRun
      ? { releasePlan: 'recomputed after the local merge, before release mutations' }
      : {}),
  }
  console.log(JSON.stringify(value, null, options.json ? 0 : 2))
}

async function executePreparedRelease(
  options: CliOptions,
  shipPlan: ShipPlan,
  interactive: boolean,
) {
  const preparation = await prepareShip(shipPlan)
  const releaseOptions: ReleaseCommandOptions = {
    ...options,
    cwd: shipPlan.repositoryRoot,
    interactive,
  }
  const releasePlan = await planRelease(releaseOptions)
  assertReleaseCanExecute(releasePlan, options.yes === true || interactive)
  if (options.json !== true) {
    console.log(JSON.stringify(releasePlan, null, 2))
  }
  if (interactive) {
    try {
      await confirm(
        `Release ${releasePlan.plan.version.nextVersion} from ${shipPlan.targetBranch}?`,
      )
    } catch (error) {
      if (error instanceof Cancelled) {
        throw new CancelledAfterPreparation(shipPlan.targetBranch)
      }
      throw error
    }
  }
  const release = await executePlannedRelease(releasePlan.plan, releaseOptions)
  return { kind: 'shipped', preparation, release } as const
}

export async function runShipWizard(initialOptions: CliOptions): Promise<void> {
  const interactive = canPrompt(initialOptions)
  if (!interactive && initialOptions.dryRun !== true && initialOptions.yes !== true) {
    throw new UsageError('Non-interactive ship requires --yes because it commits and merges code.')
  }
  const options = interactive ? await completeShipOptions(initialOptions) : initialOptions
  const shipPlan = await planShip(options)
  const readiness = await planRelease({ ...options, cwd: shipPlan.repositoryRoot })
  assertShipReleaseReady(readiness)
  if (options.dryRun === true) {
    renderPreparation(options, shipPlan, readiness, true)
    return
  }
  if (options.json !== true) {
    renderPreparation(options, shipPlan, readiness, false)
  }
  if (interactive) {
    await confirm(
      `Commit ${shipPlan.sourceBranch}, merge into ${shipPlan.targetBranch}, and continue?`,
    )
  }
  const result = await executePreparedRelease(options, shipPlan, interactive)
  console.log(options.json === true ? JSON.stringify(result) : JSON.stringify(result, null, 2))
}

export function registerShipCommand(program: Command): void {
  program
    .command('ship [source]')
    .description('Commit a feature branch, merge it into the release branch, and release it')
    .option('--target <branch>', 'release branch; detected from configuration by default')
    .option('-m, --message <message>', 'commit message for uncommitted feature changes')
    .option('--merge-message <message>', 'merge commit message')
    .addHelpText(
      'after',
      '\nExamples:\n  releaser ship --bump patch\n  releaser ship --target master -m "feat: checkout" --bump minor --yes\n  releaser ship --dry-run -m "fix: totals" --bump patch',
    )
    .action(async (source: string | undefined, _options, command) => {
      await runShipWizard({
        ...(command.optsWithGlobals() as CliOptions),
        ...(source === undefined ? {} : { source }),
      })
    })
}
