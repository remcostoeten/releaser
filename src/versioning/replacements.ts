import type { ReplacementConfig, ReplacementPatternConfig } from '../config/schema.js'
import type { FileMutation, ReplacementPattern, TextEdit } from '../domain/mutations.js'
import { RepoRelativePath, type SemVer } from '../domain/semantic.js'
import { versionParts } from '../domain/version.js'
import { renderTemplate } from '../application/render-template.js'

export type ReplacementPlan =
  | { kind: 'planned'; mutation: FileMutation }
  | {
      kind: 'mismatch'
      pattern: ReplacementPattern
      expectedMatches: number
      actualMatches: number
    }

function patternValue(config: ReplacementPatternConfig): ReplacementPattern {
  return typeof config === 'string'
    ? { kind: 'literal', value: config }
    : { kind: 'regex', source: config.pattern, flags: config.flags }
}

function literalEdits(source: string, find: string, replacement: string): TextEdit[] {
  const edits: TextEdit[] = []
  let offset = 0

  while (offset <= source.length - find.length) {
    const matchOffset = source.indexOf(find, offset)
    if (matchOffset === -1) {
      break
    }
    edits.push({ offset: matchOffset, deletedText: find, insertedText: replacement })
    offset = matchOffset + find.length
  }

  return edits
}

function regexEdits(
  source: string,
  pattern: { pattern: string; flags: string },
  replacement: string,
): TextEdit[] {
  const regex = new RegExp(pattern.pattern, pattern.flags)
  const edits: TextEdit[] = []

  if (!regex.global) {
    const match = regex.exec(source)
    return match === null
      ? edits
      : [{ offset: match.index, deletedText: match[0], insertedText: replacement }]
  }

  for (const match of source.matchAll(regex)) {
    edits.push({ offset: match.index, deletedText: match[0], insertedText: replacement })
  }
  return edits
}

export function planReplacement(
  source: string,
  config: ReplacementConfig,
  previousVersion: SemVer,
  nextVersion: SemVer,
): ReplacementPlan {
  const pattern = Object.freeze(patternValue(config.find))
  const replacement = renderTemplate(config.replace, {
    version: nextVersion,
    previousVersion,
    ...versionParts(nextVersion),
  })
  const edits =
    typeof config.find === 'string'
      ? literalEdits(source, config.find, replacement)
      : regexEdits(source, config.find, replacement)

  if (edits.length !== config.expectedMatches) {
    return {
      kind: 'mismatch',
      pattern,
      expectedMatches: config.expectedMatches,
      actualMatches: edits.length,
    }
  }

  return {
    kind: 'planned',
    mutation: Object.freeze({
      kind: 'configured-replacement',
      path: RepoRelativePath.from(config.file, 'a configured replacement path'),
      pattern,
      expectedMatches: config.expectedMatches,
      edits: Object.freeze(edits.map((edit) => Object.freeze(edit))),
    }),
  }
}
