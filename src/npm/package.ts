import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { PackagePrivate } from '../domain/errors.js'
import {
  AbsolutePath,
  DistTagName,
  PackageName,
  RepoRelativePath,
  SemVer,
} from '../domain/semantic.js'
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

function validationReason(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'package.json'}: ${issue.message}`)
    .join('; ')
}

function parseManifest(value: unknown, versionValue: unknown, root: string): NpmPackageManifest {
  const parsed = packageSchema.safeParse(value)

  if (!parsed.success) {
    throw new Error(validationReason(parsed.error))
  }
  if (typeof versionValue !== 'string') {
    throw new TypeError('release version: expected a string')
  }

  const publishConfig = parsed.data.publishConfig
  const tag = publishConfig?.tag
  const parsedTag = tag === undefined ? null : DistTagName.parse(tag)

  if (tag !== undefined && parsedTag === null) {
    throw new Error(`publishConfig.tag: ${tag} is not a usable npm dist-tag`)
  }

  return {
    name: PackageName.from(parsed.data.name, 'package.json name'),
    version: SemVer.from(versionValue, 'release version'),
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
    root: AbsolutePath.from(root, 'the package root'),
  }
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createPackageReader(
  cwd: string,
  versionFile = 'package.json',
): { read(): Promise<NpmManifestLookup> } {
  const root = resolve(cwd)
  const path = join(root, 'package.json')
  const versionPath = join(root, RepoRelativePath.from(versionFile, 'the configured version file'))

  return {
    async read(): Promise<NpmManifestLookup> {
      try {
        const source = await readFile(path, 'utf8')
        const packageValue: unknown = JSON.parse(source)
        const versionValue: unknown =
          versionFile === 'package.json'
            ? packageValue
            : JSON.parse(await readFile(versionPath, 'utf8'))
        const version =
          versionValue !== null && typeof versionValue === 'object' && 'version' in versionValue
            ? versionValue.version
            : undefined
        return { kind: 'found', manifest: parseManifest(packageValue, version, root) }
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
