import type { ReleaseNotes } from '../domain/release-notes.js'

export type ReleaseNotesGenerator = {
  generate(notes: ReleaseNotes): Promise<ReleaseNotes>
}
