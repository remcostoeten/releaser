import type { FileMutation, TextEdit } from '../domain/mutations.js'
import { RepoRelativePath, type SemVer } from '../domain/semantic.js'
import { parseJsonLocations, propertyAtPath, stringValueEdit } from './json-locations.js'

const PACKAGE_LOCK = RepoRelativePath.from('package-lock.json', 'the npm lockfile path')

export function planPackageLockVersion(
  source: string,
  previousVersion: SemVer,
  nextVersion: SemVer,
): FileMutation | null {
  const root = parseJsonLocations(source)
  const nodes = [
    propertyAtPath(root, ['version']),
    propertyAtPath(root, ['packages', '', 'version']),
  ]
  const edits = nodes
    .filter((node) => node !== null)
    .map((node) => Object.freeze(stringValueEdit(source, node, nextVersion)))

  if (edits.length === 0) {
    return null
  }

  return Object.freeze({
    kind: 'lockfile-version',
    path: PACKAGE_LOCK,
    previousVersion,
    nextVersion,
    edits: Object.freeze(edits) as readonly TextEdit[],
  })
}
