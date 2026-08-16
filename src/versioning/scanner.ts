import { lstat, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { RepoRelativePath, type SemVer } from '../domain/semantic.js'
import type { CommandRunner } from '../shared/command-runner.js'

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.output',
])

export type VersionOccurrence = Readonly<{
  file: RepoRelativePath
  line: number
  column: number
}>

export type VersionScanner = {
  scan(version: SemVer): Promise<readonly VersionOccurrence[]>
}

function splitNul(output: string): string[] {
  return output.split('\0').filter((path) => path.length > 0)
}

function isAlwaysExcluded(path: string): boolean {
  return path.split('/').some((segment) => EXCLUDED_DIRECTORIES.has(segment))
}

function decodeText(content: Buffer): string | null {
  if (content.includes(0)) {
    return null
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch (error) {
    if (error instanceof TypeError) {
      return null
    }
    throw error
  }
}

// Tracked symlinks may dangle or resolve to directories; their Git content
// is the target path string, so they carry no version text worth scanning.
async function readRegularFile(absolutePath: string): Promise<Buffer | null> {
  const stats = await lstat(absolutePath)
  return stats.isFile() ? readFile(absolutePath) : null
}

function occurrencesIn(
  path: RepoRelativePath,
  source: string,
  version: string,
): VersionOccurrence[] {
  const occurrences: VersionOccurrence[] = []
  let offset = 0
  let line = 1
  let lineStart = 0

  while (offset <= source.length - version.length) {
    const matchOffset = source.indexOf(version, offset)
    if (matchOffset === -1) {
      break
    }
    while (true) {
      const newline = source.indexOf('\n', lineStart)
      if (newline === -1 || newline >= matchOffset) {
        break
      }
      line += 1
      lineStart = newline + 1
    }
    occurrences.push(Object.freeze({ file: path, line, column: matchOffset - lineStart + 1 }))
    offset = matchOffset + version.length
  }
  return occurrences
}

async function ignoredPaths(runner: CommandRunner, root: string): Promise<Set<string>> {
  try {
    await readFile(join(root, '.releaserignore'))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return new Set()
    }
    throw error
  }

  const result = await runner.runOrThrow(
    'git',
    ['ls-files', '--cached', '--ignored', '--exclude-from=.releaserignore', '-z'],
    { cwd: root },
  )
  return new Set(splitNul(result.stdout))
}

export function createVersionScanner(runner: CommandRunner, cwd: string): VersionScanner {
  const root = resolve(cwd)

  return {
    async scan(version): Promise<readonly VersionOccurrence[]> {
      const [trackedResult, ignored] = await Promise.all([
        runner.runOrThrow('git', ['ls-files', '--cached', '-z'], { cwd: root }),
        ignoredPaths(runner, root),
      ])
      const paths = splitNul(trackedResult.stdout)
        .filter((path) => !isAlwaysExcluded(path) && !ignored.has(path))
        .toSorted()
      const occurrences = (
        await Promise.all(
          paths.map(async (untrustedPath) => {
            const path = RepoRelativePath.from(untrustedPath, 'a Git-tracked path')
            const content = await readRegularFile(join(root, path))
            const source = content === null ? null : decodeText(content)
            return source === null ? [] : occurrencesIn(path, source, version)
          }),
        )
      ).flat()

      return Object.freeze(occurrences)
    },
  }
}
