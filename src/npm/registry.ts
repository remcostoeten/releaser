import { z } from 'zod'
import { NpmAuthFailed, NpmRegistryUnavailable, VersionAlreadyPublished } from '../domain/errors.js'
import { highestVersion, parseVersion } from '../domain/version.js'
import type { PackageName, SemVer } from '../domain/semantic.js'
import type { NpmCommand } from './npm-command.js'
import { commandOutput } from './npm-command.js'

const registryPayloadSchema = z.object({
  versions: z.array(z.string()).optional().default([]),
  'dist-tags': z.record(z.string(), z.string()).optional().default({}),
})

const userPayloadSchema = z.object({ username: z.string().min(1) })

export type RegistryPackageState =
  | { kind: 'never-published' }
  | {
      kind: 'published'
      versions: readonly SemVer[]
      latest: SemVer | null
      highest: SemVer | null
    }

export type RegistryReader = {
  readPackage(packageName: PackageName, cwd: string): Promise<RegistryPackageState>
  versionExists(packageName: PackageName, version: SemVer, cwd: string): Promise<boolean>
  readAuthentication(cwd: string): Promise<{ kind: 'authenticated'; user: string }>
}

export function createRegistryReader(npm: NpmCommand): RegistryReader {
  async function readPackage(packageName: PackageName, cwd: string): Promise<RegistryPackageState> {
    const result = await npm.run(['view', packageName, 'versions', 'dist-tags', '--json'], cwd)
    if (result.exitCode !== 0) {
      const output = commandOutput(result)
      if (isNotFound(output)) {
        return { kind: 'never-published' }
      }
      throwRegistryError(output)
    }

    const payload = parseJson(result.stdout, 'npm view')
    const parsed = registryPayloadSchema.safeParse(payload)
    if (!parsed.success) {
      throw new NpmRegistryUnavailable('npm returned an unexpected package response')
    }

    const versions = parsed.data.versions.map((version) =>
      parseVersion(version, 'registry version'),
    )
    const latestValue = parsed.data['dist-tags'].latest
    return {
      kind: 'published',
      versions,
      latest: latestValue === undefined ? null : parseVersion(latestValue, 'latest dist-tag'),
      highest: highestVersion(versions),
    }
  }

  return {
    readPackage,
    async versionExists(packageName, version, cwd): Promise<boolean> {
      const state = await readPackage(packageName, cwd)
      return state.kind === 'published' && state.versions.includes(version)
    },
    async readAuthentication(cwd): Promise<{ kind: 'authenticated'; user: string }> {
      const result = await npm.run(['whoami', '--json'], cwd)
      if (result.exitCode !== 0) {
        throw new NpmAuthFailed(commandOutput(result))
      }
      const parsed = userPayloadSchema.safeParse(parseJson(result.stdout, 'npm whoami'))
      if (!parsed.success) {
        throw new NpmAuthFailed('npm returned an unexpected authentication response')
      }
      return { kind: 'authenticated', user: parsed.data.username }
    },
  }
}

export function assertVersionUnpublished(state: RegistryPackageState, version: SemVer): void {
  if (state.kind === 'published' && state.versions.includes(version)) {
    throw new VersionAlreadyPublished(version)
  }
}

function parseJson(source: string, operation: string): unknown {
  try {
    return JSON.parse(source)
  } catch {
    throw new NpmRegistryUnavailable(`${operation} returned invalid JSON`)
  }
}

function isNotFound(output: string): boolean {
  return /(?:E404|404 Not Found|is not in this registry)/iu.test(output)
}

function throwRegistryError(output: string): never {
  if (/(?:E401|E403|401 Unauthorized|403 Forbidden)/iu.test(output)) {
    throw new NpmAuthFailed(output)
  }
  throw new NpmRegistryUnavailable(output || 'request failed without diagnostic output')
}
