import type { CreateReleasePlanDependencies } from '../../src/application/create-release-plan.js'
import type {
  GitHubRepositoryRef,
  GitHubTokenStatus,
  ManifestLookup,
  MutationPlanOutcome,
  NpmAuthentication,
  PreviousRelease,
  PublishedVersions,
} from '../../src/application/ports.js'
import type { ReleaseNotes } from '../../src/domain/release-notes.js'
import type { RepositoryState } from '../../src/domain/repository.js'

export type PortRecorder = {
  calls: string[]
}

export type RecordingPortsOptions = {
  state?: RepositoryState
  manifest?: ManifestLookup
  published?: PublishedVersions
  authentication?: NpmAuthentication
  tokenStatus?: GitHubTokenStatus
  githubRef?: GitHubRepositoryRef | null
  previousRelease?: PreviousRelease | null
  localTagExists?: boolean
  remoteTagExists?: boolean
  mutations?: MutationPlanOutcome
  notes?: ReleaseNotes
  gitVersion?: string | null
  npmVersion?: string | null
}

export const READ_ONLY_PORT_METHODS = [
  'toolchain.readGitVersion',
  'toolchain.readNpmVersion',
  'repository.readState',
  'repository.findPreviousRelease',
  'repository.localTagExists',
  'repository.remoteTagExists',
  'manifest.read',
  'registry.readPublishedVersions',
  'registry.readAuthentication',
  'github.resolveRepository',
  'github.readTokenStatus',
  'mutations.planMutations',
  'notes.collect',
  'clock.now',
  'ids.next',
]

export function cleanRepositoryState(root = '/tmp/repo'): RepositoryState {
  return {
    root,
    head: {
      kind: 'branch',
      branch: 'main',
      sha: 'a'.repeat(40),
      upstream: {
        kind: 'tracked',
        remote: 'origin',
        ref: 'origin/main',
        sha: 'a'.repeat(40),
        ahead: 0,
        behind: 0,
      },
    },
    workingTree: { kind: 'clean' },
    statusDigest: 'digest-clean',
    remotes: ['origin'],
    defaultBranch: 'main',
  }
}

export function createRecordingPorts(options: RecordingPortsOptions = {}): {
  deps: CreateReleasePlanDependencies
  recorder: PortRecorder
} {
  const recorder: PortRecorder = { calls: [] }

  function record<T>(method: string, value: T): Promise<T> {
    recorder.calls.push(method)
    return Promise.resolve(value)
  }

  const state = options.state ?? cleanRepositoryState()
  const manifest: ManifestLookup = options.manifest ?? {
    kind: 'found',
    manifest: { name: 'example-package', version: '1.2.3', private: false },
  }
  const published: PublishedVersions = options.published ?? {
    kind: 'published',
    versions: ['1.0.0', '1.2.3'],
  }
  const notes: ReleaseNotes = options.notes ?? {
    version: '1.2.4',
    previousVersion: '1.2.3',
    sections: [],
  }

  const deps: CreateReleasePlanDependencies = {
    toolchain: {
      readGitVersion: () => record('toolchain.readGitVersion', options.gitVersion ?? '2.43.0'),
      readNpmVersion: () => record('toolchain.readNpmVersion', options.npmVersion ?? '10.8.2'),
    },
    repository: {
      readState: () => record('repository.readState', { kind: 'found' as const, state }),
      findPreviousRelease: () =>
        record('repository.findPreviousRelease', options.previousRelease ?? null),
      localTagExists: () => record('repository.localTagExists', options.localTagExists ?? false),
      remoteTagExists: () => record('repository.remoteTagExists', options.remoteTagExists ?? false),
    },
    manifest: {
      read: () => record('manifest.read', manifest),
    },
    registry: {
      readPublishedVersions: () => record('registry.readPublishedVersions', published),
      readAuthentication: () =>
        record(
          'registry.readAuthentication',
          options.authentication ?? { kind: 'authenticated' as const, user: 'release-bot' },
        ),
    },
    github: {
      resolveRepository: () =>
        record(
          'github.resolveRepository',
          options.githubRef === undefined
            ? { owner: 'remcostoeten', repo: 'releaser' }
            : options.githubRef,
        ),
      readTokenStatus: () =>
        record(
          'github.readTokenStatus',
          options.tokenStatus ?? { kind: 'valid' as const, login: 'release-bot', canWrite: true },
        ),
    },
    mutations: {
      planMutations: () =>
        record('mutations.planMutations', options.mutations ?? { kind: 'planned', mutations: [] }),
    },
    notes: {
      collect: () => record('notes.collect', notes),
    },
    clock: {
      now: () => {
        recorder.calls.push('clock.now')
        return '2026-01-01T00:00:00.000Z'
      },
    },
    ids: {
      next: () => {
        recorder.calls.push('ids.next')
        return 'plan-0001'
      },
    },
  }

  return { deps, recorder }
}
