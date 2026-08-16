import { NpmRegistryUnavailable } from '../domain/errors.js'
import { NpmIntegrity, NpmShasum, PackageName } from '../domain/semantic.js'
import { parseVersion } from '../domain/version.js'
import type { CommandResult } from '../shared/command-runner.js'
import type { NpmCommand } from './npm-command.js'
import type { NpmPackageFile, NpmPackageInspection, NpmPublishAccess } from './types.js'

type InspectionDocument = {
  name?: unknown
  version?: unknown
  filename?: unknown
  files?: unknown
  size?: unknown
  unpackedSize?: unknown
  shasum?: unknown
  integrity?: unknown
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseFiles(value: unknown): NpmPackageFile[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object') {
      return []
    }
    const file = entry as Record<string, unknown>
    if (typeof file.path !== 'string') {
      return []
    }
    return [
      { path: file.path, size: numberOrZero(file.size), mode: numberOrZero(file.mode) || null },
    ]
  })
}

export function parseInspection(result: CommandResult, context: string): NpmPackageInspection {
  if (result.exitCode !== 0) {
    throw new NpmRegistryUnavailable(`npm failed while ${context}`, {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    })
  }

  let value: unknown
  try {
    value = JSON.parse(result.stdout)
  } catch (error) {
    throw new NpmRegistryUnavailable(`npm returned invalid JSON while ${context}`, {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
  const candidate = Array.isArray(value) ? value[0] : value
  const raw = unwrapInspection(candidate)
  if (raw === null || typeof raw !== 'object') {
    throw new NpmRegistryUnavailable(`npm returned no package details while ${context}`)
  }
  const document = raw as InspectionDocument
  if (
    typeof document.name !== 'string' ||
    typeof document.version !== 'string' ||
    typeof document.filename !== 'string' ||
    typeof document.shasum !== 'string' ||
    typeof document.integrity !== 'string'
  ) {
    throw new NpmRegistryUnavailable(`npm returned incomplete package details while ${context}`)
  }

  return {
    name: PackageName.from(document.name, context),
    version: parseVersion(document.version, context),
    filename: document.filename,
    files: parseFiles(document.files),
    packedSize: numberOrZero(document.size),
    unpackedSize: numberOrZero(document.unpackedSize),
    shasum: NpmShasum.from(document.shasum, context),
    integrity: NpmIntegrity.from(document.integrity, context),
  }
}

function unwrapInspection(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || 'name' in value) {
    return value
  }

  const entries = Object.values(value)
  return entries.length === 1 ? entries[0] : value
}

export function createPackageInspector(command: NpmCommand): {
  packDryRun(): Promise<NpmPackageInspection>
  publishDryRun(access: NpmPublishAccess, tag: string): Promise<NpmPackageInspection>
} {
  return {
    async packDryRun(): Promise<NpmPackageInspection> {
      return parseInspection(
        await command.run(['pack', '--dry-run', '--json']),
        'running npm pack --dry-run',
      )
    },
    async publishDryRun(access, tag): Promise<NpmPackageInspection> {
      return parseInspection(
        await command.run(['publish', '--dry-run', '--json', '--access', access, '--tag', tag]),
        'running npm publish --dry-run',
      )
    },
  }
}
