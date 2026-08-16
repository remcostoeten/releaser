import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ReleaserConfig } from '../config/schema.js'
import type { FileMutation } from '../domain/mutations.js'
import { RepoRelativePath } from '../domain/semantic.js'
import type { MutationPlanner } from '../application/ports.js'
import { planPackageJsonVersion } from './package-json.js'
import { planPackageLockVersion } from './package-lock.js'
import { planReplacement } from './replacements.js'

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

function readReplacementSources(root: string, config: ReleaserConfig) {
  return Promise.all(
    config.replacements.map(async (replacement) => {
      const path = RepoRelativePath.from(replacement.file, 'a configured replacement path')
      return { replacement, path, source: await readOptional(join(root, path)) }
    }),
  )
}

async function planVersionMutation(
  root: string,
  versionFile: RepoRelativePath,
  previousVersion: Parameters<typeof planPackageJsonVersion>[1],
  nextVersion: Parameters<typeof planPackageJsonVersion>[2],
): Promise<FileMutation> {
  const source = await readFile(join(root, versionFile), 'utf8')
  return planPackageJsonVersion(source, previousVersion, nextVersion, versionFile)
}

export function createMutationPlanner(cwd: string, config: ReleaserConfig): MutationPlanner {
  const root = resolve(cwd)
  const versionFile = RepoRelativePath.from(config.versionFile, 'the configured version file')

  return {
    async planMutations(request) {
      const mutations: FileMutation[] = [
        await planVersionMutation(root, versionFile, request.previousVersion, request.nextVersion),
      ]
      const packageLock = await readOptional(join(root, 'package-lock.json'))

      if (config.versionFile === 'package.json' && packageLock !== null) {
        const mutation = planPackageLockVersion(
          packageLock,
          request.previousVersion,
          request.nextVersion,
        )
        if (mutation !== null) {
          mutations.push(mutation)
        }
      }

      const replacementSources = await readReplacementSources(root, config)

      for (const { replacement, path, source } of replacementSources) {
        const planned = planReplacement(
          source ?? '',
          replacement,
          request.previousVersion,
          request.nextVersion,
        )
        if (planned.kind === 'mismatch') {
          return {
            kind: 'replacement-mismatch',
            file: path,
            pattern: planned.pattern,
            expectedMatches: planned.expectedMatches,
            actualMatches: planned.actualMatches,
          }
        }
        mutations.push(planned.mutation)
      }

      return { kind: 'planned', mutations: Object.freeze(mutations) }
    },
  }
}
