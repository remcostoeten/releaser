import type { RepoRelativePath, SemVer } from './semantic.js'

export type TextEdit = {
  offset: number
  deletedText: string
  insertedText: string
}

export type ReplacementPattern =
  | { kind: 'literal'; value: string }
  | { kind: 'regex'; source: string; flags: string }

export type FileMutation =
  | {
      kind: 'manifest-version'
      path: RepoRelativePath
      previousVersion: SemVer
      nextVersion: SemVer
      edits: TextEdit[]
    }
  | {
      kind: 'lockfile-version'
      path: RepoRelativePath
      previousVersion: SemVer
      nextVersion: SemVer
      edits: TextEdit[]
    }
  | {
      kind: 'configured-replacement'
      path: RepoRelativePath
      pattern: ReplacementPattern
      expectedMatches: number
      edits: TextEdit[]
    }

function sortedEdits(edits: readonly TextEdit[]): TextEdit[] {
  return edits.toSorted((left, right) => left.offset - right.offset)
}

export function editsApplyTo(content: string, edits: readonly TextEdit[]): boolean {
  return edits.every(
    (edit) =>
      content.slice(edit.offset, edit.offset + edit.deletedText.length) === edit.deletedText,
  )
}

export function applyEdits(content: string, edits: readonly TextEdit[]): string {
  let output = ''
  let cursor = 0

  for (const edit of sortedEdits(edits)) {
    output += content.slice(cursor, edit.offset) + edit.insertedText
    cursor = edit.offset + edit.deletedText.length
  }

  return output + content.slice(cursor)
}

export function mutatedPaths(mutations: readonly FileMutation[]): RepoRelativePath[] {
  return [...new Set(mutations.map((mutation) => mutation.path))].toSorted()
}
