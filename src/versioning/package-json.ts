import type { FileMutation } from '../domain/mutations.js'
import { RepoRelativePath, type SemVer } from '../domain/semantic.js'
import { parseJsonLocations, propertyAtPath, stringValueEdit } from './json-locations.js'

export function planPackageJsonVersion(
  source: string,
  previousVersion: SemVer,
  nextVersion: SemVer,
  path = RepoRelativePath.from('package.json', 'the npm manifest path'),
): FileMutation {
  const versionNode = propertyAtPath(parseJsonLocations(source), ['version'])
  if (versionNode === null) {
    throw new TypeError(`${path} does not contain a version field`)
  }
  const edit = Object.freeze(stringValueEdit(source, versionNode, nextVersion))

  return Object.freeze({
    kind: 'manifest-version',
    path,
    previousVersion,
    nextVersion,
    edits: Object.freeze([edit]),
  })
}
