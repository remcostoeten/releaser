import {
  AbsolutePath,
  BranchName,
  Digest,
  DistTagName,
  Iso8601,
  PackageName,
  PlanId,
  Ref,
  RepoRelativePath,
  SemVer,
  Sha,
  TagName,
} from '../../src/domain/semantic.js'

const CONTEXT = 'a test fixture'

export function sha(value: string): Sha {
  return Sha.from(value, CONTEXT)
}

export function digest(value: string): Digest {
  return Digest.from(value, CONTEXT)
}

export function ref(value: string): Ref {
  return Ref.from(value, CONTEXT)
}

export function branch(value: string): BranchName {
  return BranchName.from(value, CONTEXT)
}

export function tag(value: string): TagName {
  return TagName.from(value, CONTEXT)
}

export function version(value: string): SemVer {
  return SemVer.from(value, CONTEXT)
}

export function distTag(value: string): DistTagName {
  return DistTagName.from(value, CONTEXT)
}

export function packageName(value: string): PackageName {
  return PackageName.from(value, CONTEXT)
}

export function absolutePath(value: string): AbsolutePath {
  return AbsolutePath.from(value, CONTEXT)
}

export function repoPath(value: string): RepoRelativePath {
  return RepoRelativePath.from(value, CONTEXT)
}

export function timestamp(value: string): Iso8601 {
  return Iso8601.from(value, CONTEXT)
}

export function planId(value: string): PlanId {
  return PlanId.from(value, CONTEXT)
}
