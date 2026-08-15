import type { Change, ChangeCategory } from './changes.js'
import type { SemVer } from './semantic.js'

export type ReleaseNotesSection = {
  category: ChangeCategory
  changes: Change[]
}

export type ReleaseNotes = {
  version: SemVer
  previousVersion: SemVer | null
  sections: ReleaseNotesSection[]
}

export function emptyReleaseNotes(version: SemVer, previousVersion: SemVer | null): ReleaseNotes {
  return { version, previousVersion, sections: [] }
}

export function countChanges(notes: ReleaseNotes): number {
  return notes.sections.reduce((total, section) => total + section.changes.length, 0)
}
