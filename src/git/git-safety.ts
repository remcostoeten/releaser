import type { RepositoryState } from '../domain/repository.js'
import type { BranchName, Sha, TagName } from '../domain/semantic.js'

export type GitSafetyFinding =
  | { kind: 'dirty-working-tree'; entries: string[] }
  | { kind: 'detached-head'; sha: Sha }
  | { kind: 'missing-remote'; remote: string }
  | { kind: 'wrong-branch'; expected: BranchName; actual: BranchName }
  | { kind: 'no-upstream'; branch: BranchName }
  | { kind: 'behind-upstream'; branch: BranchName; behind: number }
  | { kind: 'diverged-from-upstream'; branch: BranchName; ahead: number; behind: number }
  | { kind: 'tag-exists-locally'; tag: TagName; sha: Sha }
  | { kind: 'tag-exists-on-remote'; tag: TagName; remote: string; sha: Sha }

export type TagPresence = {
  name: TagName
  localSha: Sha | null
  remoteSha: Sha | null
}

export type GitSafetyInput = {
  state: RepositoryState
  remote: string
  releaseBranch: BranchName | null
  tag: TagPresence | null
}

function headFindings(input: GitSafetyInput): GitSafetyFinding[] {
  const { head } = input.state

  if (head.kind === 'detached') {
    return [{ kind: 'detached-head', sha: head.sha }]
  }

  const findings: GitSafetyFinding[] = []

  if (input.releaseBranch !== null && input.releaseBranch !== head.branch) {
    findings.push({ kind: 'wrong-branch', expected: input.releaseBranch, actual: head.branch })
  }

  if (head.upstream.kind === 'none') {
    findings.push({ kind: 'no-upstream', branch: head.branch })
    return findings
  }

  const { ahead, behind } = head.upstream

  if (behind > 0 && ahead > 0) {
    findings.push({ kind: 'diverged-from-upstream', branch: head.branch, ahead, behind })
  } else if (behind > 0) {
    findings.push({ kind: 'behind-upstream', branch: head.branch, behind })
  }

  return findings
}

function tagFindings(input: GitSafetyInput): GitSafetyFinding[] {
  if (input.tag === null) {
    return []
  }

  const findings: GitSafetyFinding[] = []
  const { name, localSha, remoteSha } = input.tag

  if (localSha !== null) {
    findings.push({ kind: 'tag-exists-locally', tag: name, sha: localSha })
  }

  if (remoteSha !== null) {
    findings.push({ kind: 'tag-exists-on-remote', tag: name, remote: input.remote, sha: remoteSha })
  }

  return findings
}

/**
 * Reports every unsafe condition the Git side of a release can be in, as data.
 * Nothing here throws and nothing is ranked: severity and overridability are
 * preflight's decision, and this module has no opinion on which findings a
 * user may wave through.
 */
export function inspectGitSafety(input: GitSafetyInput): GitSafetyFinding[] {
  const findings: GitSafetyFinding[] = []

  if (input.state.workingTree.kind === 'dirty') {
    findings.push({ kind: 'dirty-working-tree', entries: input.state.workingTree.entries })
  }

  if (!input.state.remotes.includes(input.remote)) {
    findings.push({ kind: 'missing-remote', remote: input.remote })
  }

  return [...findings, ...headFindings(input), ...tagFindings(input)]
}
