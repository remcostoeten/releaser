import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { buildInitPlan } from '../config/build-init-config.js'
import { detectVersionSource } from '../config/detect-version-source.js'
import { repositoryRoot } from './release-service.js'

export type InitCommandOptions = {
  cwd?: string
  force?: boolean
  dryRun?: boolean
}

export type InitResult =
  | { kind: 'no-config-needed'; root: string; reason: string }
  | { kind: 'already-configured'; root: string; configPath: string }
  | {
      kind: 'initialized'
      root: string
      configPath: string
      versionFilePath: string | null
      summary: string
      dryRun: boolean
    }

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function writeFileEnsuringDir(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents, 'utf8')
}

/**
 * Detects the version source for a project with no package.json (Cargo,
 * Python, CMake, PKGBUILD, or a bare VERSION file) and generates a
 * releaser.config.json for it. Read-only unless a plan is actually written.
 */
export async function initRelease(options: InitCommandOptions): Promise<InitResult> {
  const root = await repositoryRoot(options.cwd)
  const configPath = join(root, 'releaser.config.json')

  if (options.force !== true && (await readIfExists(configPath)) !== null) {
    return { kind: 'already-configured', root, configPath }
  }

  const source = await detectVersionSource(root)
  const plan = buildInitPlan(source)

  if (plan.kind === 'no-config-needed') {
    return { kind: 'no-config-needed', root, reason: plan.reason }
  }

  if (options.dryRun !== true) {
    await writeFileEnsuringDir(configPath, `${JSON.stringify(plan.config, null, 2)}\n`)
    if (plan.versionFile !== null) {
      await writeFileEnsuringDir(join(root, plan.versionFile.path), plan.versionFile.contents)
    }
  }

  return {
    kind: 'initialized',
    root,
    configPath,
    versionFilePath: plan.versionFile?.path ?? null,
    summary: plan.summary,
    dryRun: options.dryRun === true,
  }
}
