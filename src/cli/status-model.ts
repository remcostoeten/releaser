import type { RepositoryState } from '../domain/repository.js'
import type { NpmManifestLookup } from '../npm/types.js'

export type HumanStatusResult = {
  repository:
    | { kind: 'found'; state: RepositoryState }
    | { kind: 'no-commits'; root: string }
    | { kind: 'not-a-repository'; path: string }
  manifest: NpmManifestLookup
  registry:
    | { kind: 'published'; versions: string[] }
    | { kind: 'never-published' }
    | { kind: 'skipped'; reason: string }
    | { kind: 'unavailable'; reason: string }
  tag:
    | { kind: 'available'; name: string; local: boolean; remote: boolean }
    | { kind: 'unavailable'; name: string | null; reason: string }
  github:
    | { kind: 'release'; tag: string; url: string; draft: boolean; prerelease: boolean }
    | { kind: 'not-released'; tag: string }
    | { kind: 'skipped'; reason: string }
    | { kind: 'unauthenticated'; reason: string }
    | { kind: 'unavailable'; reason: string }
}
