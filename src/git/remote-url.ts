export type RemoteRepository = {
  host: string
  owner: string
  repo: string
}

const SCP_LIKE = /^(?:(?<user>[^@/]+)@)?(?<host>[^:/]+):(?<path>.+)$/
const GIT_SUFFIX = /\.git$/

function splitOwnerRepo(path: string, host: string): RemoteRepository | null {
  const segments = path.replace(/^\/+/, '').replace(/\/+$/, '').split('/')

  if (segments.length < 2) {
    return null
  }

  const repo = segments.at(-1)
  const owner = segments.at(-2)

  if (repo === undefined || owner === undefined || owner.length === 0) {
    return null
  }

  const name = repo.replace(GIT_SUFFIX, '')

  return name.length === 0 ? null : { host, owner, repo: name }
}

/**
 * Parses the URL forms `git remote get-url` can return — `https://`, `ssh://`,
 * `git://`, and the SCP-like `git@host:owner/repo.git` — into host, owner and
 * repository name. Returns `null` for anything else, including local paths,
 * rather than guessing.
 */
export function parseRemoteUrl(url: string): RemoteRepository | null {
  const trimmed = url.trim()

  if (trimmed.length === 0) {
    return null
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      return splitOwnerRepo(parsed.pathname, parsed.hostname)
    } catch {
      return null
    }
  }

  const scp = SCP_LIKE.exec(trimmed)

  if (scp?.groups === undefined) {
    return null
  }

  const { host, path } = scp.groups

  if (host === undefined || path === undefined) {
    return null
  }

  return splitOwnerRepo(path, host)
}
