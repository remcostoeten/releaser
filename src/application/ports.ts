import type { FileMutation } from '../domain/mutations.js'
import type { ReleaseNotes } from '../domain/release-notes.js'
import type { ReleaseBoundary, RepositoryState } from '../domain/repository.js'
import type {
  Iso8601,
  PackageName,
  PlanId,
  RepoRelativePath,
  SemVer,
  Sha,
  TagName,
} from '../domain/semantic.js'

export type RepositoryLookup =
  | { kind: 'found'; state: RepositoryState }
  | { kind: 'not-a-repository'; path: string }

export type PreviousRelease = {
  ref: TagName
  sha: Sha
  version: SemVer
}

export type RepositoryReader = {
  readState(): Promise<RepositoryLookup>
  findPreviousRelease(tagPrefix: string): Promise<PreviousRelease | null>
  localTagExists(tag: string): Promise<boolean>
  remoteTagExists(remote: string, tag: string): Promise<boolean>
}

export type PackageManifest = {
  name: PackageName
  version: SemVer
  private: boolean
}

export type ManifestLookup =
  | { kind: 'found'; manifest: PackageManifest }
  | { kind: 'unreadable'; path: string; reason: string }

export type ManifestReader = {
  read(): Promise<ManifestLookup>
}

export type PublishedVersions =
  | { kind: 'published'; versions: string[] }
  | { kind: 'never-published' }

export type NpmAuthentication = { kind: 'authenticated'; user: string } | { kind: 'anonymous' }

export type RegistryReader = {
  readPublishedVersions(packageName: string): Promise<PublishedVersions>
  readAuthentication(): Promise<NpmAuthentication>
}

export type GitHubTokenStatus =
  | { kind: 'absent' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'valid'; login: string; canWrite: boolean }

export type GitHubRepositoryRef = { owner: string; repo: string }

export type GitHubReader = {
  resolveRepository(remote: string): Promise<GitHubRepositoryRef | null>
  readTokenStatus(): Promise<GitHubTokenStatus>
}

export type ToolchainReader = {
  readGitVersion(): Promise<string | null>
  readNpmVersion(): Promise<string | null>
}

export type MutationPlanRequest = {
  previousVersion: SemVer
  nextVersion: SemVer
}

export type MutationPlanOutcome =
  | { kind: 'planned'; mutations: FileMutation[] }
  | {
      kind: 'replacement-mismatch'
      file: RepoRelativePath
      expectedMatches: number
      actualMatches: number
    }

export type MutationPlanner = {
  planMutations(request: MutationPlanRequest): Promise<MutationPlanOutcome>
}

export type NotesRequest = {
  boundary: ReleaseBoundary
  version: SemVer
  previousVersion: SemVer | null
}

export type NotesReader = {
  collect(request: NotesRequest): Promise<ReleaseNotes>
}

export type PlanClock = {
  now(): Iso8601
}

export type PlanIdFactory = {
  next(): PlanId
}
