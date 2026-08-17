import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadConfig } from '../config/load.js'
import { createGitReader } from '../git/git-reader.js'
import { createGitHubClient } from '../github/github-client.js'
import { resolveGitHubTokenWithGh } from '../github/token.js'
import { createNpmClient } from '../npm/npm-client.js'
import { createPackageReader } from '../npm/package.js'
import { createCommandRunner } from '../shared/command-runner.js'
import type { HumanStatusResult } from './status-model.js'

export async function readHumanReleaseStatus(options: {
  cwd?: string
}): Promise<HumanStatusResult> {
  const root = await repositoryRoot(options.cwd)
  const config = await loadConfig(root)
  const runner = createCommandRunner()
  const git = createGitReader(runner, { cwd: root, remote: config.remote })
  const npm = createNpmClient(runner, root)
  const [repository, manifest] = await Promise.all([
    git.readState(),
    createPackageReader(root, config).read(),
  ])
  const registry = await readHumanRegistryStatus(config.npm.publish, manifest, npm)
  const tagName =
    manifest.kind === 'found' ? `${config.tagPrefix}${manifest.manifest.version}` : null
  const tag = await readHumanTagStatus(tagName, git)
  const github = await readHumanGitHubStatus(config.github.release, tagName, git, runner)

  return { repository, manifest, registry, tag, github }
}

async function repositoryRoot(cwd: string | undefined): Promise<string> {
  const candidate = await realpath(resolve(cwd ?? process.cwd()))
  const runner = createCommandRunner()
  const location = await createGitReader(runner, { cwd: candidate, remote: 'origin' }).locate()
  return location.kind === 'not-a-repository' ? candidate : location.root
}

async function readHumanRegistryStatus(
  enabled: boolean,
  manifest: HumanStatusResult['manifest'],
  npm: ReturnType<typeof createNpmClient>,
): Promise<HumanStatusResult['registry']> {
  if (!enabled) {
    return { kind: 'skipped', reason: 'npm publication is disabled' }
  }
  if (manifest.kind !== 'found') {
    return { kind: 'unavailable', reason: 'package manifest is unreadable' }
  }
  const packageName = manifest.manifest.name
  if (packageName === null) {
    return { kind: 'unavailable', reason: 'the repository has no package.json name' }
  }
  try {
    return await npm.readPublishedVersions(packageName)
  } catch {
    return { kind: 'unavailable', reason: 'npm registry could not be reached or authenticated' }
  }
}

async function readHumanTagStatus(
  tagName: string | null,
  git: ReturnType<typeof createGitReader>,
): Promise<HumanStatusResult['tag']> {
  if (tagName === null) {
    return { kind: 'unavailable', name: null, reason: 'package version is unavailable' }
  }
  try {
    const [local, remote] = await Promise.all([
      git.localTagExists(tagName),
      git.remoteTagExists(tagName),
    ])
    return { kind: 'available', name: tagName, local, remote }
  } catch {
    return { kind: 'unavailable', name: tagName, reason: 'tag state could not be read' }
  }
}

async function readHumanGitHubStatus(
  enabled: boolean,
  tagName: string | null,
  git: ReturnType<typeof createGitReader>,
  runner: ReturnType<typeof createCommandRunner>,
): Promise<HumanStatusResult['github']> {
  if (!enabled) {
    return { kind: 'skipped', reason: 'GitHub Release creation is disabled' }
  }
  if (tagName === null) {
    return { kind: 'unavailable', reason: 'package version is unavailable' }
  }
  try {
    const repository = await git.readRemoteRepository()
    if (repository === null) {
      return { kind: 'unavailable', reason: 'remote is not a supported GitHub repository' }
    }
    const token = await resolveGitHubTokenWithGh(runner)
    if (token === null) {
      return {
        kind: 'unauthenticated',
        reason: 'Run `gh auth login`, or set GITHUB_TOKEN or GH_TOKEN',
      }
    }
    const baseUrl =
      repository.host === 'github.com' ? undefined : `https://${repository.host}/api/v3`
    const client = createGitHubClient(token.value, baseUrl === undefined ? {} : { baseUrl })
    await client.readAuthenticatedLogin()
    const release = await client.findReleaseByTag(repository, tagName)
    return release === null
      ? { kind: 'not-released', tag: tagName }
      : {
          kind: 'release',
          tag: release.tag,
          url: release.url,
          draft: release.draft,
          prerelease: release.prerelease,
        }
  } catch {
    return { kind: 'unavailable', reason: 'GitHub could not be reached or authenticated' }
  }
}
