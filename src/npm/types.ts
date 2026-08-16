import type {
  AbsolutePath,
  DistTagName,
  NpmIntegrity,
  NpmShasum,
  NpmUsername,
  PackageName,
  SemVer,
} from '../domain/semantic.js'

export type NpmPublishAccess = 'public' | 'restricted'

export type NpmPublishConfig = Readonly<{
  access: NpmPublishAccess | null
  registry: string | null
  tag: DistTagName | null
  provenance: boolean | null
}>

export type NpmPackageManifest = Readonly<{
  name: PackageName
  version: SemVer
  private: boolean
  publishConfig: NpmPublishConfig | null
  files: readonly string[] | null
  root: AbsolutePath
}>

export type NpmManifestLookup =
  | { kind: 'found'; manifest: NpmPackageManifest }
  | { kind: 'unreadable'; path: string; reason: string }

export type NpmRegistryPackage = Readonly<{
  name: PackageName
  versions: readonly SemVer[]
  latest: SemVer | null
}>

export type NpmRegistryLookup =
  | { kind: 'found'; package: NpmRegistryPackage }
  | { kind: 'not-found' }

export type NpmAuthentication = { kind: 'authenticated'; user: NpmUsername } | { kind: 'anonymous' }

export type NpmPackageFile = Readonly<{
  path: string
  size: number
  mode: number | null
}>

export type NpmPackageInspection = Readonly<{
  name: PackageName
  version: SemVer
  filename: string
  files: readonly NpmPackageFile[]
  packedSize: number
  unpackedSize: number
  shasum: NpmShasum
  integrity: NpmIntegrity
}>

export type NpmPublishRequest = Readonly<{
  packageName: PackageName
  version: SemVer
  access: NpmPublishAccess
  tag: DistTagName
  otp?: string
}>

export type NpmPublishAttempt =
  | { kind: 'published'; inspection: NpmPackageInspection }
  | {
      kind: 'unknown'
      exitCode: number
      stdout: string
      stderr: string
    }
