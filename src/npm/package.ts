import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { InvalidPackageManifest, PackagePrivate } from '../domain/errors.js'
import { AbsolutePath, PackageName, SemVer } from '../domain/semantic.js'

const publishConfigSchema = z
  .object({
    access: z.enum(['public', 'restricted']).optional(),
    tag: z.string().min(1).optional(),
    registry: z.string().url().optional(),
    provenance: z.boolean().optional(),
  })
  .passthrough()

const packageManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    private: z.boolean().optional().default(false),
    publishConfig: publishConfigSchema.optional(),
    files: z.array(z.string()).optional(),
  })
  .passthrough()

export type PublishConfig = z.output<typeof publishConfigSchema>

export type PackageManifest = Readonly<{
  name: PackageName
  version: SemVer
  private: boolean
  publishConfig: PublishConfig | null
  files: readonly string[] | null
  root: AbsolutePath
  path: AbsolutePath
}>

export type PackageReader = {
  read(root: string): Promise<PackageManifest>
}

export function createPackageReader(): PackageReader {
  return {
    async read(root): Promise<PackageManifest> {
      const packageRoot = resolve(root)
      const manifestPath = join(packageRoot, 'package.json')
      let source: string

      try {
        source = await readFile(manifestPath, 'utf8')
      } catch (error) {
        throw new InvalidPackageManifest(manifestPath, describeError(error))
      }

      let input: unknown
      try {
        input = JSON.parse(source)
      } catch (error) {
        throw new InvalidPackageManifest(manifestPath, describeError(error))
      }

      const parsed = packageManifestSchema.safeParse(input)
      if (!parsed.success) {
        throw new InvalidPackageManifest(manifestPath, parsed.error.issues)
      }

      const name = PackageName.parse(parsed.data.name)
      const version = SemVer.parse(parsed.data.version)
      if (name === null || version === null) {
        throw new InvalidPackageManifest(manifestPath, {
          name: name === null ? 'invalid npm package name' : null,
          version: version === null ? 'invalid SemVer' : null,
        })
      }
      if (parsed.data.private) {
        throw new PackagePrivate()
      }

      return {
        name,
        version,
        private: false,
        publishConfig: parsed.data.publishConfig ?? null,
        files: parsed.data.files ?? null,
        root: AbsolutePath.from(packageRoot, 'package root'),
        path: AbsolutePath.from(manifestPath, 'package manifest path'),
      }
    },
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
