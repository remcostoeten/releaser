import type { Change, ChangeCategory } from './changes.js'

export type ReleaseNotesSection = {
  category: ChangeCategory
  changes: Change[]
}

export type ReleaseNotes = {
  version: string
  previousVersion: string | null
  sections: ReleaseNotesSection[]
}

export function emptyReleaseNotes(version: string, previousVersion: string | null): ReleaseNotes {
  return { version, previousVersion, sections: [] }
}

export function countChanges(notes: ReleaseNotes): number {
  return notes.sections.reduce((total, section) => total + section.changes.length, 0)
}
