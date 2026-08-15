import type {
  BranchName,
  DistTagName,
  PackageName,
  RepoRelativePath,
  SemVer,
  TagName,
} from './semantic.js'

export type GitCommitAction = {
  message: string
  paths: RepoRelativePath[]
}

export type GitTagAction = {
  name: TagName
  message: string
}

export type PushTarget = { kind: 'branch'; branch: BranchName } | { kind: 'tag'; tag: TagName }

export type GitPushAction = {
  remote: string
  target: PushTarget
}

export type NpmPublishAction =
  | {
      kind: 'publish'
      packageName: PackageName
      version: SemVer
      distTag: DistTagName
      access: 'public' | 'restricted'
    }
  | { kind: 'skipped'; reason: string }

export type GitHubReleaseAction =
  | {
      kind: 'create'
      owner: string
      repo: string
      tagName: TagName
      name: string
      body: string
      draft: boolean
      prerelease: boolean
    }
  | { kind: 'skipped'; reason: string }
