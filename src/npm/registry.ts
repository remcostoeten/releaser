import { NpmRegistryUnauthorized, NpmRegistryUnavailable } from '../domain/errors.js'
import { NpmShasum, PackageName, type SemVer } from '../domain/semantic.js'
import { parseVersion } from '../domain/version.js'
import type { NpmCommand } from './npm-command.js'
import type { NpmRegistryLookup, NpmRegistryPackage } from './types.js'

type RegistryDocument = {
  name?: unknown
  versions?: unknown
  'dist-tags'?: unknown
}

const NOT_FOUND_PATTERN = /(?:\bE404\b|\b404\b.*not found)/iu
const UNAUTHORIZED_PATTERN = /(?:\bE401\b|\bE403\b|\b401\b|\b403\b)/u

function parseJson(output: string, context: string): unknown {
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new NpmRegistryUnavailable(`npm returned invalid JSON while ${context}`, {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

function parseVersions(value: unknown): SemVer[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((version): version is string => typeof version === 'string')
    .map((version) => parseVersion(version, 'an npm registry version'))
}

function parsePackage(value: unknown, requestedName: string): NpmRegistryPackage {
  if (value === null || typeof value !== 'object') {
    throw new NpmRegistryUnavailable('npm returned an invalid package document')
  }

  const document = value as RegistryDocument
  const name = typeof document.name === 'string' ? document.name : requestedName
  const distTags =
    document['dist-tags'] !== null && typeof document['dist-tags'] === 'object'
      ? (document['dist-tags'] as Record<string, unknown>)
      : {}
  const latest = typeof distTags.latest === 'string' ? parseVersion(distTags.latest) : null

  return {
    name: PackageName.from(name, 'the npm registry package name'),
    versions: parseVersions(document.versions),
    latest,
  }
}

async function readRegistryPackage(
  command: NpmCommand,
  packageName: string,
): Promise<NpmRegistryLookup> {
  const result = await command.run(['view', packageName, 'name', 'versions', 'dist-tags', '--json'])

  if (result.exitCode === 0) {
    return {
      kind: 'found',
      package: parsePackage(parseJson(result.stdout, 'reading package data'), packageName),
    }
  }

  const output = `${result.stdout}\n${result.stderr}`
  if (NOT_FOUND_PATTERN.test(output)) {
    return { kind: 'not-found' }
  }
  if (UNAUTHORIZED_PATTERN.test(output)) {
    throw new NpmRegistryUnauthorized(packageName)
  }
  throw new NpmRegistryUnavailable(`Could not read ${packageName} from the npm registry`, {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  })
}

export function createRegistryReader(command: NpmCommand): {
  readPackage(packageName: string): Promise<NpmRegistryLookup>
  readPublishedVersions(
    packageName: string,
  ): Promise<{ kind: 'published'; versions: string[] } | { kind: 'never-published' }>
  versionExists(packageName: string, version: string): Promise<boolean>
  readVersionShasum(packageName: string, version: string): Promise<NpmShasum | null>
} {
  function readPackage(packageName: string): Promise<NpmRegistryLookup> {
    return readRegistryPackage(command, packageName)
  }

  return {
    readPackage,
    async readPublishedVersions(packageName) {
      const lookup = await readPackage(packageName)
      return lookup.kind === 'not-found'
        ? { kind: 'never-published' }
        : { kind: 'published', versions: [...lookup.package.versions] }
    },
    async versionExists(packageName, version) {
      const lookup = await readPackage(packageName)
      return lookup.kind === 'found' && lookup.package.versions.includes(parseVersion(version))
    },
    async readVersionShasum(packageName, version) {
      const result = await command.run([
        'view',
        `${packageName}@${version}`,
        'dist.shasum',
        '--json',
      ])
      if (result.exitCode !== 0) {
        if (NOT_FOUND_PATTERN.test(`${result.stdout}\n${result.stderr}`)) {
          return null
        }
        throw new NpmRegistryUnavailable(`Could not verify ${packageName}@${version}`, {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        })
      }
      const value = parseJson(result.stdout, `verifying ${packageName}@${version}`)
      return typeof value === 'string'
        ? NpmShasum.from(value, `npm view ${packageName}@${version} dist.shasum`)
        : null
    },
  }
}
