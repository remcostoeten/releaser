# Task 04 — GitHub infrastructure

Read `AGENTS.md` and `SPEC.md` first.

Implement everything under `src/github/` using Octokit. No GitHub write may
occur during planning.

Do not implement Git or npm in this task.

## Repository detection

Derive owner and repository from the Git remote URL. Support HTTPS, SSH
(`git@github.com:owner/repo.git`), `ssh://`, and `git://` forms, with and
without a `.git` suffix, and GitHub Enterprise hosts.

## Read operations

- repository lookup
- latest release
- release by tag
- merged pull requests in a commit range
- contributor information where useful

`src/github/github-client.ts` is the only file that touches Octokit. Raw
Octokit response objects never leave `src/github/` — normalize into
`domain/changes.ts` types at the boundary.

## Write operations

Create a GitHub Release with: tag, target commit, title, body, draft flag,
prerelease flag.

Before creating, look the release up by tag. If it exists, recognize it and
skip — never create a second. Repeated execution after success is a no-op, per
`SPEC.md` §7.3.

## Authentication

Support `GITHUB_TOKEN` and `GH_TOKEN`. Optionally detect existing GitHub CLI
authentication via `gh auth token` through `CommandRunner`.

Distinguish "no token", "invalid token", and "token lacks `contents: write` on
this repository" — they need different remediation and only the third is
recoverable by scope change.

Never print or journal authentication material.

## Reliability

Handle secondary rate limits and `retry-after` with bounded backoff. Retry
idempotent reads; never blindly retry the release creation — re-check by tag
first.

## Tests

All API tests use a mocked or stubbed client. No test performs a real API
call.

Cover: remote URL parsing across every supported form, including Enterprise
hosts; normal release creation; prerelease; draft; release already exists;
repository not found; no token; invalid token; insufficient scope; 5xx and
rate-limit responses; idempotent re-creation.

Run `pnpm check`.
