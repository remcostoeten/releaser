import * as prompts from '@clack/prompts'
import type { Command } from 'commander'
import type { ReleaseCheck } from '../../domain/checks.js'
import {
  Cancelled,
  CancelledAfterPreparation,
  PreflightFailed,
  UsageError,
} from '../../domain/errors.js'
import type { ShipPlan } from '../../domain/ship-plan.js'
import {
  renderCheckRows,
  renderPlanReport,
  renderSuccessSummary,
  type CheckRowView,
} from '../../ui/index.js'
import { planReportView } from '../command-reports.js'
import {
  executePlannedRelease,
  planRelease,
  type ReleaseCommandOptions,
} from '../release-service.js'
import { inspectShip, planShip, prepareShip, type ShipCommandOptions } from '../ship-service.js'
import { authorizePreflight } from '../preflight-overrides.js'
import { createCliOutputContext, type CliOutputOptions } from '../output-context.js'
import { createProgressReporter, renderExecutionResult } from '../execution-output.js'

type CliOptions = ShipCommandOptions & CliOutputOptions

function canPrompt(options: CliOptions): boolean {
  const output = createCliOutputContext(options)
  return (
    process.stdin.isTTY === true &&
    options.yes !== true &&
    !output.json &&
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

function assertReleasePlanned(
  result: Awaited<ReturnType<typeof planRelease>>,
): asserts result is Extract<Awaited<ReturnType<typeof planRelease>>, { kind: 'planned' }> {
  if (result.kind !== 'planned') {
    throw new PreflightFailed(result.checks)
  }
}

function checkView(check: ReleaseCheck): CheckRowView {
  if (check.outcome === 'passed' || check.outcome === 'informed') {
    return {
      status: 'passed',
      title: check.title,
      ...(check.outcome === 'informed' ? { message: check.message } : {}),
    }
  }
  if (check.outcome === 'skipped') {
    return { status: 'skipped', title: check.title, message: check.reason }
  }
  return {
    status: check.outcome === 'warned' ? 'warned' : 'blocked',
    title: check.title,
    message: check.message,
    remediation: check.remediation,
  }
}

function renderChecks(checks: readonly ReleaseCheck[], options: CliOutputOptions): void {
  const output = createCliOutputContext(options)
  console.log(renderCheckRows(checks.map(checkView), output.stdout))
}

async function confirmOverride(message: string): Promise<boolean> {
  const answer = await prompts.confirm({ message })
  return !prompts.isCancel(answer) && answer
}

async function authorizeRelease(
  result: Awaited<ReturnType<typeof planRelease>>,
  options: CliOptions,
  interactive: boolean,
) {
  const output = createCliOutputContext(options)
  if (!output.json) {
    renderChecks(result.checks, options)
  }
  const acceptedOverrideCheckIds = await authorizePreflight(result.checks, {
    yes: options.yes === true,
    canPrompt: interactive,
    ...(interactive ? { confirmOverride } : {}),
  })
  assertReleasePlanned(result)
  return { result, acceptedOverrideCheckIds }
}

function renderPreparation(
  options: CliOptions,
  plan: ShipPlan,
  readiness: Extract<Awaited<ReturnType<typeof planRelease>>, { kind: 'planned' }>,
  dryRun: boolean,
): void {
  const output = createCliOutputContext(options)
  const value = {
    kind: dryRun ? 'ship-dry-run' : 'ship-preparation',
    preparation: plan,
    releaseReadiness: readiness.checks,
    provisionalVersion: readiness.plan.version.nextVersion,
    ...(dryRun
      ? { releasePlan: 'recomputed after the local merge, before release mutations' }
      : {}),
  }
  if (output.json) {
    console.log(JSON.stringify(value))
    return
  }
  console.log(
    renderSuccessSummary(
      {
        title: dryRun ? 'Ship dry run — nothing was written' : 'Feature preparation planned',
        rows: [
          { label: 'Source', value: plan.sourceBranch },
          { label: 'Target', value: plan.targetBranch },
          { label: 'Changes', value: String(plan.changes.length) },
          { label: 'Release', value: readiness.plan.version.nextVersion },
        ],
        skipped: dryRun ? ['release plan will be recomputed after the local merge'] : [],
      },
      output.stdout,
    ),
  )
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
  const authorized = await authorizeRelease(releasePlan, options, interactive)
  if (!createCliOutputContext(options).json) {
    console.log(
      renderPlanReport(planReportView(releasePlan), createCliOutputContext(options).stdout),
    )
  }
  if (interactive) {
    try {
      await confirm(
        `Release ${authorized.result.plan.version.nextVersion} from ${shipPlan.targetBranch}?`,
      )
    } catch (error) {
      if (error instanceof Cancelled) {
        throw new CancelledAfterPreparation(shipPlan.targetBranch)
      }
      throw error
    }
  }
  const output = createCliOutputContext(options)
  const progress = createProgressReporter(output.json, output.stderr)
  const release = await executePlannedRelease(authorized.result.plan, {
    ...releaseOptions,
    acceptedOverrideCheckIds: authorized.acceptedOverrideCheckIds,
    onExecutionEvent: progress.onEvent,
  })
  if (!output.json) {
    console.log(
      [
        renderSuccessSummary(
          {
            title: 'Feature preparation completed',
            rows: [
              { label: 'Target', value: preparation.targetBranch },
              { label: 'Feature commit', value: preparation.featureCommitSha, state: 'muted' },
              { label: 'Merge commit', value: preparation.mergeCommitSha, state: 'muted' },
            ],
          },
          output.stdout,
        ),
        renderExecutionResult(authorized.result.plan, release, output.stdout),
      ].join('\n\n'),
    )
  }
  return { kind: 'shipped', preparation, release } as const
}

export async function runShipWizard(initialOptions: CliOptions): Promise<void> {
  const interactive = canPrompt(initialOptions)
  if (!interactive && initialOptions.dryRun !== true && initialOptions.yes !== true) {
    throw new UsageError('Non-interactive ship requires --yes because it commits and merges code.')
  }
  const options = interactive ? await completeShipOptions(initialOptions) : initialOptions
  const output = createCliOutputContext(options)
  const shipPlan = await planShip(options)
  const readiness = await planRelease({ ...options, cwd: shipPlan.repositoryRoot })
  const authorized = await authorizeRelease(readiness, options, interactive)
  if (options.dryRun === true) {
    renderPreparation(options, shipPlan, authorized.result, true)
    return
  }
  if (!output.json) {
    renderPreparation(options, shipPlan, authorized.result, false)
  }
  if (interactive) {
    await confirm(
      `Commit ${shipPlan.sourceBranch}, merge into ${shipPlan.targetBranch}, and continue?`,
    )
  }
  const result = await executePreparedRelease(options, shipPlan, interactive)
  if (output.json) {
    console.log(JSON.stringify(result))
  }
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
