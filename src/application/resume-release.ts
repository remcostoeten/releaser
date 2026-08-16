import { InvalidJournal } from '../domain/errors.js'
import type { ExecuteReleasePlanOptions, ExecuteReleasePlanResult } from './execute-release-plan.js'
import { resumeWithSession } from './execute-release-plan.js'
import type { ExecutionDependencies } from './execution-ports.js'

export async function resumeRelease(
  deps: ExecutionDependencies,
  repositoryRoot: string,
  options: ExecuteReleasePlanOptions = {},
): Promise<ExecuteReleasePlanResult> {
  if (options.dryRun === true) {
    throw new InvalidJournal(repositoryRoot, 'A resume cannot be run as a dry run')
  }
  const journal = await deps.journal.open(repositoryRoot)
  try {
    const stored = await journal.read()
    if (stored === null) {
      throw new InvalidJournal(journal.paths.journal, 'No journal exists for this repository')
    }
    return await resumeWithSession(deps, stored, journal, options)
  } finally {
    await journal.release()
  }
}
