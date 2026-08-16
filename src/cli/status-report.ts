import type { RepositoryState } from '../domain/repository.js'
import type { KeyValueRow, StatusReportView } from '../ui/index.js'
import type { HumanStatusResult } from './status-model.js'

export function statusReportView(status: HumanStatusResult): StatusReportView {
  return {
    sections: [
      { title: 'Repository', rows: repositoryRows(status.repository) },
      { title: 'Package and npm registry', rows: packageRows(status) },
      { title: 'Git tag', rows: tagRows(status) },
      { title: 'GitHub Release', rows: githubRows(status) },
    ],
  }
}

function repositoryRows(repository: HumanStatusResult['repository']): KeyValueRow[] {
  if (repository.kind === 'not-a-repository') {
    return [{ label: 'State', value: `Not a Git repository: ${repository.path}`, state: 'failure' }]
  }
  if (repository.kind === 'no-commits') {
    return [
      { label: 'Root', value: repository.root },
      { label: 'State', value: 'No commits', state: 'warning' },
    ]
  }
  return repositoryStateRows(repository.state)
}

function repositoryStateRows(state: RepositoryState): KeyValueRow[] {
  const branch = state.head.kind === 'branch' ? state.head.branch : 'detached HEAD'
  const upstream =
    state.head.kind === 'branch' && state.head.upstream.kind === 'tracked'
      ? `${state.head.upstream.remote}/${state.head.upstream.ref} (${state.head.upstream.ahead} ahead, ${state.head.upstream.behind} behind)`
      : 'not configured'
  return [
    { label: 'Root', value: state.root },
    { label: 'Branch', value: branch, state: state.head.kind === 'branch' ? 'success' : 'warning' },
    {
      label: 'Working tree',
      value: state.workingTree.kind,
      state: state.workingTree.kind === 'clean' ? 'success' : 'warning',
    },
    { label: 'Upstream', value: upstream },
  ]
}

function packageRows(status: HumanStatusResult): KeyValueRow[] {
  if (status.manifest.kind === 'unreadable') {
    return [
      { label: 'Manifest', value: status.manifest.path, state: 'failure' },
      { label: 'State', value: status.manifest.reason, state: 'failure' },
      registryRow(status.registry),
    ]
  }
  const manifest = status.manifest.manifest
  return [
    { label: 'Package', value: manifest.name },
    { label: 'Version', value: manifest.version },
    registryRow(status.registry, manifest.version),
  ]
}

function registryRow(
  registry: HumanStatusResult['registry'],
  currentVersion?: string,
): KeyValueRow {
  if (registry.kind === 'published') {
    const current =
      currentVersion === undefined ? false : registry.versions.includes(currentVersion)
    return {
      label: 'npm registry',
      value: `${registry.versions.length} published version${registry.versions.length === 1 ? '' : 's'}; current ${current ? 'published' : 'not published'}`,
      state: current ? 'success' : 'warning',
    }
  }
  if (registry.kind === 'never-published') {
    return { label: 'npm registry', value: 'Never published', state: 'warning' }
  }
  return {
    label: 'npm registry',
    value: `${registry.kind === 'skipped' ? 'Skipped' : 'Unavailable'}: ${registry.reason}`,
    state: 'warning',
  }
}

function tagRows(status: HumanStatusResult): KeyValueRow[] {
  if (status.tag.kind === 'unavailable') {
    return [
      { label: 'Tag', value: status.tag.name ?? 'unknown' },
      { label: 'State', value: `Unavailable: ${status.tag.reason}`, state: 'warning' },
    ]
  }
  return [
    { label: 'Tag', value: status.tag.name },
    {
      label: 'Local',
      value: status.tag.local ? 'exists' : 'absent',
      state: status.tag.local ? 'success' : 'muted',
    },
    {
      label: 'Remote',
      value: status.tag.remote ? 'exists' : 'absent',
      state: status.tag.remote ? 'success' : 'muted',
    },
  ]
}

function githubRows(status: HumanStatusResult): KeyValueRow[] {
  if (status.github.kind === 'release') {
    return [
      {
        label: 'State',
        value: status.github.draft ? 'Draft release' : 'Published release',
        state: 'success',
      },
      { label: 'Tag', value: status.github.tag },
      { label: 'URL', value: status.github.url },
      { label: 'Prerelease', value: status.github.prerelease ? 'yes' : 'no' },
    ]
  }
  if (status.github.kind === 'not-released') {
    return [
      { label: 'State', value: 'No release found', state: 'muted' },
      { label: 'Tag', value: status.github.tag },
    ]
  }
  const label =
    status.github.kind === 'skipped'
      ? 'Skipped'
      : status.github.kind === 'unauthenticated'
        ? 'Unauthenticated'
        : 'Unavailable'
  return [{ label: 'State', value: `${label}: ${status.github.reason}`, state: 'warning' }]
}
