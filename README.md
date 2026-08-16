<h1 align="center">releaser</h1>

<p align="center">
  A release CLI that decides everything before it changes anything.<br />
  One interactive pass takes a package from working tree to published npm<br />
  version, Git tag, and GitHub Release — and survives being interrupted<br />
  in the middle of it.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@remcostoeten/releaser"><img src="https://img.shields.io/npm/v/@remcostoeten/releaser?label=npm" alt="npm version" /></a>
  <a href="https://github.com/remcostoeten/releaser/releases"><img src="https://img.shields.io/github/v/release/remcostoeten/releaser?label=release" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/remcostoeten/releaser" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A524-blue" alt="Node 24+" />
</p>

Most release tools do the work and tell you afterwards. This one builds an
immutable **ReleasePlan** first — the exact version, every file it will touch,
every commit, tag, push, publish, and release it will perform — shows it to
you as a diff, and only then asks. Planning cannot mutate anything, because
planning has no access to anything that writes.

The second half matters more. A release is six or seven irreversible-ish steps
against three separate systems, and the interesting case is the one where your
laptop sleeps between step 5 and step 6. Every step is journalled before it is
attempted and checks whether it already happened before it runs, so
`releaser resume` finishes the job instead of duplicating it.

## Use

```bash
releaser          # interactive wizard
releaser plan     # build and show a plan, execute nothing
releaser status   # repo, registry, and release state
releaser doctor   # run preflight checks
releaser scan     # find version occurrences in tracked files
releaser resume   # continue an interrupted release
releaser ship     # commit a feature, merge to the release branch, and release
releaser finalize # wait for the tag's CI, then publish the draft GitHub Release
```

When work is still uncommitted on a feature branch, `ship` provides the
one-push workflow:

```bash
releaser ship --bump patch
```

It shows the feature commit and merge preparation before changing Git, asks
for the commit message when needed, merges into the configured release branch,
then shows the ordinary immutable release plan. The executor's branch push
contains both the merge and release commit, so a deployment triggered by a
push to `master` or `main` runs once. Merge conflicts are aborted locally and
the command returns to the feature branch without pushing or publishing.

For non-interactive use, approval and a feature commit message are explicit:

```bash
releaser ship --target master --message "feat: checkout" --bump minor --yes
```

Enable shell completion with one of:

```bash
source <(releaser completion bash)
eval "$(releaser completion zsh)"
releaser completion fish | source
```

Non-interactive, for CI:

```bash
releaser --bump patch --yes
releaser --version 2.0.0 --dry-run
releaser --bump prerelease --tag beta --no-interactive
```

Under `--json`, stdout is valid JSON and nothing else — progress goes to
stderr, so piping to `jq` works at every stage of a live release.

## What it refuses to do

The design is mostly a list of things that go wrong at 2am.

**It never runs `npm unpublish`.** Not on failure, not on rollback, not behind
a flag. Once a version is on the registry the release is not reversible, and
pretending otherwise is how you end up with a yanked version and a broken
consumer. A failure after publication reports exactly which steps completed
and how to finish.

**It never retries a failed `npm publish` blindly.** A network timeout after
the registry accepted the tarball looks identical to a rejection. A failed
publish is recorded as *unknown*, then resolved by asking the registry whether
the version exists. The registry is the only authority on that question.

**It never trusts `HEAD` alone to decide a plan is still valid.** Uncommitted
edits change file content without changing the SHA. A plan carries a
fingerprint of the head SHA, a digest of `git status`, the manifest version,
and the upstream SHA; if any of them moved, the plan is rejected rather than
quietly re-planned.

**It never replaces text it did not expect to find.** Every configured
replacement declares how many matches it should have. Zero matches and thirty
matches both fail planning. There is no replace-all mode, because that is the
single fastest way for a release tool to corrupt a repository.

**Its journal lives outside your repository.** In `$XDG_STATE_HOME`, not in
the working tree and not in `.git/` — a journal inside the tree gets swept up
by the release commit, or deleted by `git clean -xfd` during exactly the
recovery it exists to serve.

**It never prints your token.** Redaction is applied centrally, at the logger
and the journal writer, rather than at each call site where one missed call
leaks a credential.

## How a release runs

```
mutate-files → commit → tag → push-branch → push-tag → npm-publish → github-release
                                                            ▲
                                                     irreversible
```

The order is not arbitrary; it is sorted by how cheaply each step can be
undone. Everything freely reversible happens first. `npm-publish` sits as late
as possible while still preceding `github-release`, because a GitHub Release
pointing at a version nobody can install misleads people, whereas a published
version with no GitHub Release is a one-command repair.

`--dry-run` invokes no write boundary at all — not the filesystem, not the
network, not even the journal.

## Configuration

`releaser.config.json` at the repository root, or a `releaser` key in
`package.json`. Unknown keys are an error, not a warning: a typo in a config
key must never silently disable a safety check.

```json
{
  "releaseBranch": null,
  "remote": "origin",
  "versionFile": "package.json",
  "tagPrefix": "v",
  "commitMessage": "chore(release): {{version}}",
  "npm": { "publish": true, "access": "public", "tag": null },
  "github": { "release": true, "draft": false },
  "replacements": [
    {
      "file": "src/version.ts",
      "find": "export const VERSION = '{{previousVersion}}'",
      "replace": "export const VERSION = '{{version}}'",
      "expectedMatches": 1
    }
  ]
}
```

`releaseBranch: null` detects the remote's default branch, so `master` and
`main` repositories both work without configuration.

`versionFile` selects the JSON file containing the repository release version.
It defaults to `package.json`. Set `npm.publish` to `false` to release a private
desktop application or another repository-level product without running npm
availability, authentication, registry, pack, or publish checks. Explicit,
match-count-checked replacements can synchronize Cargo, Tauri, and nested
package versions. See the [Skriuw](examples/skriuw.releaser.config.json) and
[Dora](examples/dora.releaser.config.json) examples.

When CI owns artifact builds and creates the draft GitHub Release itself,
`releaser finalize` closes the last mile: it polls the workflow runs
triggered by the release tag, refuses to publish while any run is pending or
failed, and flips the draft to published once everything is green. It is
idempotent and safe to re-run after a timeout.

## Scope

One version and tag per run, optionally published to npm and GitHub. Repository
workspaces are permitted for non-npm releases, but independently versioned or
multi-package publication remains unsupported. No other registries, no other
forges, no plugin system. The full list of deliberate exclusions is `SPEC.md`
§2.

Prereleases never touch the `latest` dist-tag by default — `1.2.0-beta.1`
publishes to `beta`.

## Development

Bun 1.3 and Node.js 24.

```bash
bun install
bun run check   # typecheck + lint + format + test + build
```

TypeScript 7 for typechecking and build, oxlint and oxfmt for lint and format,
Vitest for tests. No ESLint, no Prettier, no bundler.

[`SPEC.md`](SPEC.md) is the normative contract and wins over any other
document. [`AGENTS.md`](AGENTS.md) covers working conventions.
[`prompts/`](prompts) sequences the implementation across eight tasks.

## License

[MIT](LICENSE)
