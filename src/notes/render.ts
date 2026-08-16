import type { Change, ChangeCategory } from '../domain/changes.js'
import type { ReleaseNotes } from '../domain/release-notes.js'

const CATEGORY_HEADINGS: Readonly<Record<ChangeCategory, string>> = {
  breaking: 'Breaking Changes',
  features: 'Features',
  fixes: 'Fixes',
  performance: 'Performance',
  documentation: 'Documentation',
  dependencies: 'Dependencies',
  maintenance: 'Maintenance',
  other: 'Other Changes',
}

function changeReference(change: Change): string {
  return change.origin.kind === 'pull-request'
    ? `#${change.origin.number}`
    : change.origin.sha.slice(0, 7)
}

function renderChange(change: Change): string {
  const author =
    change.author === null
      ? ''
      : change.origin.kind === 'pull-request'
        ? ` by @${change.author}`
        : ` by ${change.author}`
  return `- ${change.title} (${changeReference(change)})${author}`
}

export function renderReleaseNotes(notes: ReleaseNotes): string {
  if (notes.sections.length === 0) {
    return 'No changes were found for this release.'
  }

  return notes.sections
    .map(
      (section) =>
        `## ${CATEGORY_HEADINGS[section.category]}\n\n${section.changes.map((change) => renderChange(change)).join('\n')}`,
    )
    .join('\n\n')
}
