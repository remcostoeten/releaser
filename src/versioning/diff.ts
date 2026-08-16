import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyEdits, type FileMutation, type TextEdit } from '../domain/mutations.js'
import type { RepoRelativePath } from '../domain/semantic.js'

export type FileDiff = Readonly<{
  path: RepoRelativePath
  before: string
  after: string
  unified: string
}>

function lineCount(source: string): number {
  if (source.length === 0) {
    return 0
  }
  return source.split('\n').length - (source.endsWith('\n') ? 1 : 0)
}

function prefixedLines(prefix: '-' | '+', source: string): string {
  const lines = source.split('\n')
  if (source.endsWith('\n')) {
    lines.pop()
  }
  return lines.map((line) => `${prefix}${line}`).join('\n')
}

export function renderUnifiedDiff(path: RepoRelativePath, before: string, after: string): string {
  if (before === after) {
    return ''
  }
  const body = [prefixedLines('-', before), prefixedLines('+', after)]
    .filter((part) => part.length > 0)
    .join('\n')
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${lineCount(before)} +1,${lineCount(after)} @@`,
    body,
  ].join('\n')
}

export function buildFileDiff(
  path: RepoRelativePath,
  before: string,
  edits: readonly TextEdit[],
): FileDiff {
  const after = applyEdits(before, edits)
  return Object.freeze({ path, before, after, unified: renderUnifiedDiff(path, before, after) })
}

export async function createMutationDiffs(
  root: string,
  mutations: readonly FileMutation[],
): Promise<readonly FileDiff[]> {
  const editsByPath = new Map<RepoRelativePath, TextEdit[]>()
  for (const mutation of mutations) {
    const edits = editsByPath.get(mutation.path) ?? []
    edits.push(...mutation.edits)
    editsByPath.set(mutation.path, edits)
  }

  const diffs = await Promise.all(
    [...editsByPath.entries()]
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(async ([path, edits]) =>
        buildFileDiff(path, await readFile(join(root, path), 'utf8'), edits),
      ),
  )
  return Object.freeze(diffs)
}
