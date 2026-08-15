export type GitCommitAction = {
  message: string
  paths: string[]
}

export type GitTagAction = {
  name: string
  message: string
}

export type PushTarget = { kind: 'branch'; branch: string } | { kind: 'tag'; tag: string }

export type GitPushAction = {
  remote: string
  target: PushTarget
}

export type NpmPublishAction =
  | {
      kind: 'publish'
      packageName: string
      version: string
      distTag: string
      access: 'public' | 'restricted'
    }
  | { kind: 'skipped'; reason: string }

export type GitHubReleaseAction =
  | {
      kind: 'create'
      owner: string
      repo: string
      tagName: string
      name: string
      body: string
      draft: boolean
      prerelease: boolean
    }
  | { kind: 'skipped'; reason: string }
