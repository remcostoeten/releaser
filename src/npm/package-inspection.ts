import { z } from 'zod'
import { CommandFailed } from '../domain/errors.js'
import type { NpmCommand } from './npm-command.js'

const packedFileSchema = z.object({
  path: z.string(),
  size: z.number().nonnegative(),
  mode: z.number().optional(),
})

const packageInspectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  filename: z.string(),
  size: z.number().nonnegative(),
  unpackedSize: z.number().nonnegative(),
  shasum: z.string(),
  integrity: z.string(),
  files: z.array(packedFileSchema),
})

export type PackageInspection = z.infer<typeof packageInspectionSchema>

export type PackageInspector = {
  packDryRun(cwd: string): Promise<PackageInspection>
  publishDryRun(cwd: string, options: PublishDryRunOptions): Promise<PackageInspection>
}

export type PublishDryRunOptions = {
  access: 'public' | 'restricted'
  tag: string
}

export function createPackageInspector(npm: NpmCommand): PackageInspector {
  async function inspect(args: string[], cwd: string): Promise<PackageInspection> {
    const result = await npm.run(args, cwd)
    if (result.exitCode !== 0) {
      throw new CommandFailed(result.commandLine, result.exitCode, result.stdout, result.stderr)
    }
    const parsed = z.array(packageInspectionSchema).safeParse(parseJson(result.stdout))
    if (!parsed.success || parsed.data.length !== 1) {
      throw new CommandFailed(
        result.commandLine,
        result.exitCode,
        result.stdout,
        'npm returned an unexpected package inspection response',
      )
    }
    const [inspection] = parsed.data
    if (inspection === undefined) {
      throw new CommandFailed(
        result.commandLine,
        result.exitCode,
        result.stdout,
        'npm returned no package inspection',
      )
    }
    return inspection
  }

  return {
    packDryRun(cwd): Promise<PackageInspection> {
      return inspect(['pack', '--dry-run', '--json'], cwd)
    },
    publishDryRun(cwd, options): Promise<PackageInspection> {
      return inspect(
        ['publish', '--dry-run', '--json', '--access', options.access, '--tag', options.tag],
        cwd,
      )
    },
  }
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source)
  } catch {
    return null
  }
}
