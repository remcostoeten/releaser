import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { VersionPatternConfig } from '../config/schema.js'
import { PackagePrivate } from '../domain/errors.js'
import {
  AbsolutePath,
  DistTagName,
  PackageName,
  RepoRelativePath,
  SemVer,
} from '../domain/semantic.js'
import { describeVersionMatchFailure, matchVersion } from '../versioning/version-pattern.js'
import type { NpmManifestLookup, NpmPackageManifest } from './types.js'

const publishConfigSchema = z
  .object({
    access: z.enum(['public', 'restricted']).optional(),
    registry: z.url().optional(),
    tag: z.string().optional(),
    provenance: z.boolean().optional(),
  })
  .optional()

const packageSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  private: z.boolean().optional(),
  publishConfig: publishConfigSchema,
  files: z.array(z.string()).optional(),
})

const anonymousPackage = {
  name: null,
  private: false,
  publishConfig: null,
  files: null,
} as const

function validationReason(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'package.json'}: ${issue.message}`)
    .join('; ')
}

type PackageIdentity = Pick<NpmPackageManifest, 'name' | 'private' | 'publishConfig' | 'files'>

function parsePackageIdentity(value: unknown): PackageIdentity {
  const parsed = packageSchema.safeParse(value)

  if (!parsed.success) {
    throw new Error(validationReason(parsed.error))
  }

  const publishConfig = parsed.data.publishConfig
  const tag = publishConfig?.tag
  const parsedTag = tag === undefined ? null : DistTagName.parse(tag)

  if (tag !== undefined && parsedTag === null) {
    throw new Error(`publishConfig.tag: ${tag} is not a usable npm dist-tag`)
  }

  return {
    name: PackageName.from(parsed.data.name, 'package.json name'),
    private: parsed.data.private ?? false,
    publishConfig:
      publishConfig === undefined
        ? null
        : {
            access: publishConfig.access ?? null,
            registry: publishConfig.registry ?? null,
            tag: parsedTag,
            provenance: publishConfig.provenance ?? null,
          },
    files: parsed.data.files ?? null,
  }
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) {
      return null
    }
    throw error
  }
}

function jsonVersion(value: unknown): unknown {
  return value !== null && typeof value === 'object' && 'version' in value
    ? value.version
    : undefined
}

export type PackageReaderOptions = {
  versionFile?: string
  versionPattern?: VersionPatternConfig | null
}

export function createPackageReader(
  cwd: string,
  options: PackageReaderOptions = {},
): { read(): Promise<NpmManifestLookup> } {
  const versionFile = options.versionFile ?? 'package.json'
  const versionPattern = options.versionPattern ?? null
  const root = resolve(cwd)
  const manifestPath = join(root, 'package.json')
  const versionPath = join(root, RepoRelativePath.from(versionFile, 'the configured version file'))

  async function readVersion(): Promise<string> {
    const source = await readFile(versionPath, 'utf8')

    if (versionPattern === null) {
      const version = jsonVersion(JSON.parse(source))
      if (typeof version !== 'string') {
        throw new TypeError('release version: expected a string')
      }
      return version
    }

    const match = matchVersion(source, versionPattern)
    if (match.kind !== 'found') {
      throw new TypeError(describeVersionMatchFailure(match, versionFile, versionPattern))
    }
    return match.value
  }

  async function readIdentity(): Promise<PackageIdentity> {
    const source = await readOptional(manifestPath)
    return source === null ? anonymousPackage : parsePackageIdentity(JSON.parse(source))
  }

  return {
    async read(): Promise<NpmManifestLookup> {
      try {
        const [version, identity] = await Promise.all([readVersion(), readIdentity()])
        return {
          kind: 'found',
          manifest: {
            ...identity,
            version: SemVer.from(version, 'release version'),
            root: AbsolutePath.from(root, 'the package root'),
          },
        }
      } catch (error) {
        return { kind: 'unreadable', path: versionPath, reason: reasonFor(error) }
      }
    },
  }
}

export function requirePublishablePackage(manifest: NpmPackageManifest): NpmPackageManifest {
  if (manifest.private) {
    throw new PackagePrivate()
  }

  return manifest
}
