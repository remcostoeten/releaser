import type { ChangeCategory } from '../domain/changes.js'

const LABEL_CATEGORIES: ReadonlyArray<readonly [ChangeCategory, readonly string[]]> = [
  ['breaking', ['breaking', 'breaking-change', 'semver-major', 'major']],
  ['features', ['feature', 'features', 'enhancement', 'semver-minor']],
  ['fixes', ['bug', 'bugfix', 'fix', 'fixes', 'semver-patch']],
  ['performance', ['performance', 'perf']],
  ['documentation', ['documentation', 'docs']],
  ['dependencies', ['dependencies', 'dependency', 'deps']],
  ['maintenance', ['maintenance', 'chore', 'ci', 'build', 'refactor', 'tests']],
]

const CONVENTIONAL_CATEGORIES: Readonly<Record<string, ChangeCategory>> = {
  feat: 'features',
  feature: 'features',
  fix: 'fixes',
  bugfix: 'fixes',
  perf: 'performance',
  docs: 'documentation',
  doc: 'documentation',
  deps: 'dependencies',
  dependency: 'dependencies',
  build: 'maintenance',
  chore: 'maintenance',
  ci: 'maintenance',
  refactor: 'maintenance',
  revert: 'maintenance',
  style: 'maintenance',
  test: 'maintenance',
}

function normalizedLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_]+/gu, '-')
}

function categoryFromLabels(labels: readonly string[]): ChangeCategory | null {
  const normalized = new Set(labels.map((label) => normalizedLabel(label)))

  for (const [category, aliases] of LABEL_CATEGORIES) {
    if (aliases.some((alias) => normalized.has(alias))) {
      return category
    }
  }

  return null
}

function isBreaking(title: string, body: string): boolean {
  return (
    /^[a-z][a-z0-9-]*(?:\([^\r\n()]+\))?!:/iu.test(title) ||
    /(?:^|\n)BREAKING[ -]CHANGE(?:S)?:/iu.test(body)
  )
}

function categoryFromTitle(title: string): ChangeCategory {
  const match = /^([a-z][a-z0-9-]*)(?:\([^\r\n()]+\))?!?:/iu.exec(title)
  return match?.[1] === undefined
    ? 'other'
    : (CONVENTIONAL_CATEGORIES[match[1].toLowerCase()] ?? 'other')
}

export function categorizeChange(
  title: string,
  body: string,
  labels: readonly string[],
): ChangeCategory {
  if (isBreaking(title, body)) {
    return 'breaking'
  }

  return categoryFromLabels(labels) ?? categoryFromTitle(title)
}
