# SPEC — `releaser` CLI

Normative specification. Agents implement this document. Where a prompt and
this document disagree, this document wins. Where this document is silent, ask
rather than invent.

---

## 1. Purpose

A safe, resumable CLI that takes a single-package JavaScript/TypeScript
repository from "current state" to "published npm version + Git tag + GitHub
Release", with every decision made and displayed *before* any mutation occurs.

The central idea: **plan, then execute**. Planning is pure and read-only.
Execution is a separate, journalled, resumable pass over an immutable plan.

## 2. Non-goals for v1

Do not build, and do not leave scaffolding for:

- Monorepos or npm/pnpm workspaces. Exactly one publishable package per run.
- Registries other than npm (no JSR, no private GitLab registries).
- Forges other than GitHub (no GitLab, no Bitbucket, no Gitea).
- Generic plugin systems, provider registries, DI containers.
- Changelog file management. v1 renders notes into the GitHub Release body
  only. `CHANGELOG.md` writing is explicitly deferred.
- AI-generated release notes. An interface exists; no implementation, no SDK,
  no network call.
- Rollback of a published npm version. See §8.

## 3. Glossary

| Term | Meaning |
|---|---|
| **ReleasePlan** | Immutable, serializable description of every mutation a release will perform. |
| **Stage** | One journalled unit of execution within a plan (see §7). |
| **Journal** | Append-only on-disk record of stage outcomes, enabling resume. |
| **Boundary** | The commit range `(previousReleaseRef, HEAD]` a release covers. |
| **Preflight** | Read-only checks run before a plan is offered to the user. |
| **Write boundary** | The narrow set of functions that mutate anything outside the process. |

## 4. Architecture

Dependency direction is one-way. Violations are build failures, not style
opinions.

```
cli/  ui/
  │
  ▼
application/
  │
  ├────────────► domain/
  │
  └────────────► git/  npm/  github/  versioning/  notes/  config/  journal/
                          │
                          └──► shared/
```

Rules:

- `domain/` imports nothing from `git/`, `npm/`, `github/`, `config/`,
  `journal/`, `shared/`, `cli/`, `ui/`, or any third-party package except
  `semver`. No `process`, no `fs`, no `fetch`.
- `application/` orchestrates. It receives infrastructure as explicit
  parameters. It never imports from `cli/` or `ui/`.
- `cli/` parses input and dispatches. No release logic in an action callback.
- `ui/` renders. It may import domain *types* for rendering, never
  infrastructure.
- Only `shared/command-runner.ts` may invoke `execa`. Nothing else spawns a
  process.

### 4.1 Module ownership map

Overlapping concerns are assigned here to prevent two agents claiming the same
file.

| Concern | Owner | Not |
|---|---|---|
| Reading + validating `package.json` manifest | `npm/package.ts` | `versioning/` |
| Writing the version field into `package.json` | `versioning/package-json.ts` | `npm/` |
| Writing the version into lockfiles | `versioning/package-lock.ts` | `npm/` |
| Arbitrary-file version occurrences | `versioning/scanner.ts` | `notes/` |
| Configured find/replace rules | `versioning/replacements.ts` | `versioning/scanner.ts` |
| Release-notes *types* | `domain/release-notes.ts` | `notes/` |
| Collecting, categorizing, rendering notes | `notes/` | `domain/` |
| Normalized commit/PR data structures | `domain/changes.ts` | `git/`, `github/` |
| Raw Git plumbing | `git/` | anywhere else |
| Raw Octokit calls | `github/github-client.ts` | any other file |

`github/` and `git/` must normalize their output into `domain/` types before
returning. Raw Octokit response objects never escape `github/`.

## 5. Versioning

Use the `semver` package for all parsing, comparison, and incrementing. Do not
hand-roll comparison.

Supported bumps: `patch`, `minor`, `major`, `prerelease`, and an explicit
custom version.

Rules:

- The proposed version must be valid SemVer.
- The proposed version must be strictly greater than **both** the local
  manifest version and the highest version published to the registry.
- A custom version equal to or below either is rejected at plan time.
- A prerelease version must not be published to the `latest` dist-tag.
  Default dist-tag for a prerelease is derived from its prerelease identifier
  (`1.2.0-beta.1` → `beta`), falling back to `next` when the identifier is
  numeric or absent. An explicit `--tag` overrides this.
- If the package has never been published, the registry check is skipped and
  only the local manifest version constrains the bump.

## 6. Preflight

Preflight is read-only and always runs before a plan is presented. Each check
returns a structured result, never a thrown string.

Severity is one of `blocking`, `warning`, `info`. Blocking checks prevent
plan execution; in interactive mode they may be individually overridden only
where marked *overridable*.

| Check | Severity | Overridable |
|---|---|---|
| Inside a Git repository | blocking | no |
| `git` executable present and ≥ 2.30 | blocking | no |
| `npm` executable present | blocking | no |
| Working tree clean | blocking | yes |
| Not in detached HEAD | blocking | yes |
| Remote `origin` configured | blocking | no |
| Current branch has an upstream | blocking | yes |
| Branch not behind upstream | blocking | no |
| Branch not diverged from upstream | blocking | no |
| On the configured release branch | warning | yes |
| Target tag does not already exist (local or remote) | blocking | no |
| Target version not already published | blocking | no |
| `package.json` readable and valid | blocking | no |
| Package not `private: true` | blocking | no |
| npm authentication resolves to a user | blocking | no |
| GitHub token present and valid | blocking | yes (skips GitHub Release stage) |
| GitHub token has `contents: write` on the repo | warning | yes |
| Every configured replacement matches its `expectedMatches` | blocking | no |

`releaser doctor` runs the same check set and reports it without building a
plan.

## 7. Execution model

### 7.1 Stages

Execution is an ordered list of stages. Each stage is journalled before it is
attempted and again after it resolves.

```
1. mutate-files     write version into package.json, lockfile, replacements
2. commit           create the release commit
3. tag              create the annotated tag locally
4. push-branch      push the branch to origin
5. push-tag         push the tag to origin
6. npm-publish      publish to the registry          ◄── IRREVERSIBLE
7. github-release   create the GitHub Release
```

### 7.2 Irreversibility gradient

The ordering above is normative and derives from how cheaply each stage can be
undone:

| Stage | Undo |
|---|---|
| `mutate-files` | `git checkout -- .` — free |
| `commit` | `git reset --hard HEAD~1` — free, local only |
| `tag` | `git tag -d` — free, local only |
| `push-branch` | force-push — disruptive but possible |
| `push-tag` | delete remote tag — disruptive but possible |
| `npm-publish` | **none** — see below |
| `github-release` | delete the release — free |

`npm-publish` is placed as late as possible while still preceding
`github-release`, because a GitHub Release pointing at an unpublished version
is worse than a published version with no GitHub Release. The latter is
repairable by `releaser resume`; the former misleads consumers.

**The tool never runs `npm unpublish`.** Not on failure, not on rollback, not
behind a flag. A failed release after stage 6 is reported as a
`PartialReleaseError` describing exactly which stages completed and the exact
command or `releaser resume` invocation needed to finish.

### 7.3 Idempotency

Every stage must be safe to re-attempt after an interrupted run.

| Stage | Pre-check that makes re-attempt safe |
|---|---|
| `mutate-files` | Compare current file content to the plan's expected post-state; skip if already applied. |
| `commit` | If `HEAD` is already the expected release commit (message + tree), skip. |
| `tag` | If the tag exists locally and points at the expected commit, skip. If it exists and points elsewhere, fail — do not move it. |
| `push-branch` | Query remote ref; skip if already at the expected SHA. |
| `push-tag` | Query remote tag; skip if present and matching. Fail if present and divergent. |
| `npm-publish` | Query the registry for the exact version. If present, verify it is ours (shasum matches the local `npm pack` output where obtainable) and skip. |
| `github-release` | Look up the release by tag. If it exists, skip. Do not create a second. |

### 7.4 npm publish failure handling

A non-zero exit from `npm publish` does **not** mean nothing was published. A
network timeout after the registry accepted the tarball is indistinguishable
from a rejection at the process level.

Required behaviour on any `npm publish` failure:

1. Journal the attempt as `outcome: "unknown"` — never as `failed`.
2. Re-query the registry for the exact version.
3. If the version now exists, mark the stage succeeded and continue.
4. If it does not exist, mark the stage failed and stop.

Blind retry of `npm publish` is forbidden. The registry query is the only
authority on whether the publish landed.

### 7.5 npm two-factor auth

`npm publish` may exit with `EOTP` when the account requires a one-time
password.

- Interactive mode: prompt for the OTP and retry once, passing `--otp`. A
  second `EOTP` is a hard failure.
- Non-interactive mode: fail immediately with a typed `OtpRequiredError`
  instructing the user to pass `--otp` or use a granular automation token.

### 7.6 Lifecycle scripts

`npm publish` runs `prepublishOnly`, `prepack`, `prepare`, and `postpublish`.
The tool does not attempt to run, suppress, or reimplement these. It does own
the failure surface: a non-zero exit from a lifecycle script must be reported
as a distinct error kind with the script name and its captured output, not as
a generic publish failure.

### 7.7 Signal handling

`SIGINT` and `SIGTERM` during execution must:

- never leave a stage unjournalled — journal the *intent* before the write,
  not only the result;
- finish flushing the journal before exiting;
- exit with code 5 and print the `releaser resume` instruction;
- never be swallowed such that a second Ctrl-C is required during a network
  call to stage 6.

### 7.8 Dry run

`--dry-run` performs no persistent writes of any kind. It may:

- run all read-only preflight checks;
- run `npm pack --dry-run` and `npm publish --dry-run`;
- compute and display the full set of file mutations as a diff.

It must not write files, create commits or tags, push, publish, or touch the
journal. Tests must assert that no function in the write boundary is invoked
during a dry run.

## 8. Journal

### 8.1 Location

The journal lives **outside the repository working tree and outside `.git/`**.
A journal inside the tree would be committed by the release commit itself, or
destroyed by `git clean -xfd` during exactly the recovery scenario it exists
to serve.

```
${XDG_STATE_HOME:-~/.local/state}/releaser/journals/<id>.json
```

where `<id>` is the first 16 hex characters of the SHA-256 of the absolute,
symlink-resolved repository root path.

### 8.2 Concurrency

Two concurrent `releaser` runs against one repository corrupt the journal.
Guard with a sibling lock file `<id>.lock` created with `O_EXCL`, containing
the owning PID and an ISO-8601 start timestamp.

A lock is considered stale, and may be broken, when the recorded PID is no
longer alive **or** the timestamp is older than one hour. Breaking a stale
lock is logged at warning level.

### 8.3 Plan staleness

A plan is bound to the repository state it was computed against. `HEAD` alone
is insufficient: uncommitted edits change file content without changing the
SHA, so an executor would apply mutations to content the plan never saw.

A plan records a `RepositoryFingerprint`:

- `headSha` — output of `git rev-parse HEAD`
- `statusDigest` — SHA-256 of the raw `git status --porcelain=v1` output
- `manifestVersion` — the `version` field read during planning
- `upstreamSha` — the remote-tracking SHA at plan time, if any

Before execution or resume, the fingerprint is recomputed and compared. Any
mismatch rejects the plan as stale with a typed `StalePlanError` naming the
field that changed. Stale plans are never silently re-planned.

### 8.4 Retention

Journals for releases that completed successfully are retained for 30 days,
then eligible for pruning. Journals in a partial state are never auto-pruned.

## 9. Version propagation

### 9.1 Scanning

`releaser scan` searches **Git-tracked text files only** for the exact current
version string. It reports occurrences; it never decides to mutate them.

Always excluded, regardless of tracking status: `.git`, `node_modules`,
`dist`, `build`, `out`, `coverage`, `.next`, `.turbo`, `.cache`, `.output`,
and any file detected as binary.

A `.releaserignore` file, when present, adds gitignore-syntax exclusions.

### 9.2 Replacements

Only *configured* replacements produce mutations. Each specifies:

- `file` — a path, relative to the repository root
- `find` — an exact string or a regex
- `replace` — a template supporting `{{version}}`, `{{previousVersion}}`,
  `{{major}}`, `{{minor}}`, `{{patch}}`
- `expectedMatches` — a required integer

If the actual match count differs from `expectedMatches`, planning fails. A
replacement that silently matches zero times, or thirty times, is the primary
way a release tool corrupts a repository. There is no "replace all
occurrences" mode.

### 9.3 Manifest and lockfile

`package.json` is mutated by targeted edit, preserving key order, indentation,
and trailing newline. Never re-serialize the whole object with
`JSON.stringify`, and never rewrite it with a regex over the raw text.

Lockfiles are synchronized where the format records the package's own version:
`package-lock.json` (`version`, `packages[""].version`). `pnpm-lock.yaml` and
`bun.lock` do not record the root version and are left untouched.

## 10. Release notes

Collect commits in the boundary via `git`, and merged pull requests in the same
range via GitHub. Deduplicate: a merge commit and the PR it merged are one
change, not two.

Categories are fixed:

`breaking`, `features`, `fixes`, `performance`, `documentation`,
`dependencies`, `maintenance`, `other`.

Conventional-commit prefixes and PR labels improve categorization when present.
Neither is required; uncategorizable changes land in `other`. Categorization is
deterministic — the same input always yields the same output.

Rendering produces GitHub-flavoured Markdown from the structured
`ReleaseNotes` value. Rendering is a pure function and is tested as one.

`notes/ai.ts` defines an interface only. No SDK dependency, no network call, no
implementation in v1.

## 11. Configuration

Resolution order, first match wins:

1. `releaser.config.json` at the repository root
2. A `releaser` key in `package.json`
3. Built-in defaults

Configuration is validated with Zod at load. Unknown keys are an error, not a
warning — a typo in a config key must not silently disable a safety check.

Configuration is deliberately JSON, not TypeScript: loading a `.ts` config
would require executing repository code before preflight has run.

```jsonc
{
  "releaseBranch": "main",
  "remote": "origin",
  "tagPrefix": "v",
  "commitMessage": "chore(release): {{version}}",
  "tagMessage": "{{version}}",
  "npm": { "publish": true, "access": "public", "tag": null },
  "github": { "release": true, "draft": false },
  "replacements": []
}
```

## 12. CLI surface

| Command | Purpose |
|---|---|
| `releaser` | Interactive release wizard |
| `releaser plan` | Build and display a plan; execute nothing |
| `releaser status` | Current repo/registry/release state |
| `releaser doctor` | Run preflight and report |
| `releaser scan` | Report version occurrences in tracked files |
| `releaser resume` | Continue an interrupted release from its journal |

Global flags: `--bump <patch|minor|major|prerelease>`, `--version <semver>`,
`--tag <dist-tag>`, `--dry-run`, `--yes`, `--no-interactive`, `--json`,
`--otp <code>`, `--cwd <path>`, `--verbose`.

Rules:

- No command prompts when `--no-interactive`, `--yes`, or `--json` is set. If
  required information is missing under those flags, fail with a clear message
  naming the missing flag.
- `--json` output contains machine-readable data only: no spinners, no colour,
  no decorative text, and nothing written to stdout that is not valid JSON.
  Human-facing progress goes to stderr.
- Cancelling any prompt exits cleanly, having mutated nothing.

### 12.1 Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Unexpected internal error |
| 2 | Usage error — bad flags or arguments |
| 3 | Preflight failed |
| 4 | Cancelled by the user |
| 5 | Partial release — resume required |
| 6 | Authentication failure |

## 13. Errors

All errors thrown across module boundaries are typed application errors
carrying a discriminant `kind`, a human-readable message, and structured
`details`. Never throw bare strings, and never let a raw `execa` error escape
`shared/command-runner.ts`.

Minimum error kinds:

`NotAGitRepository`, `DirtyWorkingTree`, `DetachedHead`, `BranchBehind`,
`BranchDiverged`, `NoUpstream`, `TagExists`, `InvalidVersion`,
`VersionNotIncreasing`, `VersionAlreadyPublished`, `PackagePrivate`,
`ReplacementMatchCount`, `NpmAuthFailed`, `OtpRequired`, `LifecycleScriptFailed`,
`GitHubAuthFailed`, `GitHubApiError`, `ReleaseExists`, `StalePlan`,
`JournalLocked`, `PartialRelease`.

Every error carries a `remediation` string: what the user should do next.

## 14. Secrets

`GITHUB_TOKEN`, npm tokens, and OTP codes are never printed, never journalled,
never included in `--json` output, and never included in error `details`.

`shared/redaction.ts` provides a redaction pass applied to every captured
process output and every logged object before it reaches a sink. Redaction is
applied centrally, at the logger and the journal writer — not at each call
site, where one missed call leaks a token.

## 15. Testing

- Git integration tests create real temporary repositories in an OS temp
  directory. No test touches the development repository.
- GitHub tests use a stubbed client. No test performs a real API call.
- **No test performs a real `npm publish` to the public registry.** Unit tests
  mock the publish boundary; integration tests may publish against a local
  Verdaccio registry, which exercises real npm semantics — dist-tags, access,
  lifecycle scripts, `EPUBLISHCONFLICT` — that mocks cannot.
- Every stage in §7.1 has an interruption test: kill after the stage, resume,
  assert no duplicated operation.
- Dry-run tests assert zero invocations of the write boundary.
- Every bug fix ships with a regression test where practical.
