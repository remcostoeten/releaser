import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type DetectedSource =
  | { kind: 'npm' }
  | { kind: 'cargo'; file: string }
  | { kind: 'python'; file: string; section: 'project' | 'tool.poetry' }
  | { kind: 'cmake'; file: string }
  | { kind: 'pkgbuild'; file: string }
  | { kind: 'existing-version-file'; file: string }
  | { kind: 'go-module' }
  | { kind: 'none' }

const PKGBUILD_CANDIDATES = ['PKGBUILD', 'packaging/PKGBUILD', 'packaging/pkgbuild/PKGBUILD']
const VERSION_FILE_CANDIDATES = ['VERSION', 'VERSION.txt', '.version']
const CMAKE_PROJECT_VERSION = /project\([\w.-]+\s+VERSION\s+\d+\.\d+\.\d+/u

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function firstExisting(root: string, candidates: readonly string[]): Promise<string | null> {
  const found = await Promise.all(candidates.map((candidate) => fileExists(join(root, candidate))))
  const index = found.indexOf(true)
  return index === -1 ? null : (candidates[index] ?? null)
}

/**
 * Best-effort detection of where a project's release version lives, for
 * projects that have no package.json. Order matters: more specific manifests
 * are preferred over a bare VERSION file, since a VERSION file may just be
 * stale scaffolding rather than the real source of truth.
 */
export async function detectVersionSource(root: string): Promise<DetectedSource> {
  if (await fileExists(join(root, 'package.json'))) {
    return { kind: 'npm' }
  }

  if (await fileExists(join(root, 'Cargo.toml'))) {
    return { kind: 'cargo', file: 'Cargo.toml' }
  }

  const pyproject = await readIfExists(join(root, 'pyproject.toml'))
  if (pyproject !== null) {
    const section = /\[project\]/u.test(pyproject) ? 'project' : 'tool.poetry'
    return { kind: 'python', file: 'pyproject.toml', section }
  }

  const cmake = await readIfExists(join(root, 'CMakeLists.txt'))
  if (cmake !== null && CMAKE_PROJECT_VERSION.test(cmake)) {
    return { kind: 'cmake', file: 'CMakeLists.txt' }
  }

  const pkgbuild = await firstExisting(root, PKGBUILD_CANDIDATES)
  if (pkgbuild !== null) {
    return { kind: 'pkgbuild', file: pkgbuild }
  }

  const versionFile = await firstExisting(root, VERSION_FILE_CANDIDATES)
  if (versionFile !== null) {
    return { kind: 'existing-version-file', file: versionFile }
  }

  if (await fileExists(join(root, 'go.mod'))) {
    return { kind: 'go-module' }
  }

  return { kind: 'none' }
}
