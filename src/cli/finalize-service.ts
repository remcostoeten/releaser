import { readFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { finalizeRelease, type FinalizeReleaseResult } from '../application/finalize-release.js'
import { loadConfig } from '../config/load.js'
import { GitHubAuthFailed, NotAGitRepository, UsageError } from '../domain/errors.js'
import { createGitReader } from '../git/git-reader.js'
import { createGitHubClient } from '../github/github-client.js'
import { resolveGitHubToken } from '../github/token.js'
import { createCommandRunner } from '../shared/command-runner.js'

export type FinalizeCommandOptions = {
  cwd?: string
  tag?: string
  wait?: boolean
  poll?: string
  timeout?: string
}

function positiveInteger(value: string | undefined, fallback: number, flag: string): number {
  if (value === undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer`)
  }
  return parsed
}

async function readReleaseVersion(root: string, versionFile: string): Promise<string> {
  const content = await readFile(join(root, versionFile), 'utf8')
  const parsed: unknown = JSON.parse(content)
  const version =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>).version
      : undefined
  if (typeof version !== 'string' || version.length === 0) {
    throw new UsageError(`${versionFile} has no version field; pass the tag explicitly.`)
  }
  return version
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((settle) => {
    setTimeout(settle, milliseconds)
  })
}

export async function finalizeReleaseFromCli(
  options: FinalizeCommandOptions,
): Promise<FinalizeReleaseResult> {
  const candidate = await realpath(resolve(options.cwd ?? process.cwd()))
  const runner = createCommandRunner()
  const location = await createGitReader(runner, { cwd: candidate, remote: 'origin' }).locate()
  if (location.kind === 'not-a-repository') {
    throw new NotAGitRepository(candidate)
  }
  const root = location.root
  const config = await loadConfig(root)
  const git = createGitReader(runner, { cwd: root, remote: config.remote })
  const tag =
    options.tag ?? `${config.tagPrefix}${await readReleaseVersion(root, config.versionFile)}`
  const remote = await git.readRemoteRepository()
  if (remote === null) {
    throw new UsageError(`Remote ${config.remote} is not a recognizable GitHub repository.`)
  }
  const token = resolveGitHubToken()
  if (token === null) {
    throw new GitHubAuthFailed('missing')
  }
  const client = createGitHubClient(
    token.value,
    remote.host === 'github.com' ? {} : { baseUrl: `https://${remote.host}/api/v3` },
  )
  const repository = { host: remote.host, owner: remote.owner, repo: remote.repo }
  return finalizeRelease(
    {
      readReleaseByTag: (releaseTag) => client.readReleaseByTag(repository, releaseTag),
      readWorkflowRunsForRef: (ref) => client.readWorkflowRunsForRef(repository, ref),
      publishRelease: (releaseId) => client.publishRelease(repository, releaseId),
      sleep,
      log: (message) => console.error(message),
    },
    {
      tag,
      wait: options.wait !== false,
      pollIntervalMs: positiveInteger(options.poll, 30, '--poll') * 1_000,
      timeoutMs: positiveInteger(options.timeout, 45, '--timeout') * 60_000,
    },
  )
}
