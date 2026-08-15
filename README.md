# release

Safe, resumable npm and GitHub release CLI.

Plan first, execute second. Every mutation a release will perform is computed,
displayed, and confirmed before anything is written. Execution is journalled so
an interrupted release can be resumed rather than restarted.

> Status: specification and scaffold. Not yet implemented.

## Install

```sh
pnpm add -D @remcostoeten/releaser
```

## Use

```sh
releaser          # interactive wizard
releaser plan     # build and show a plan, execute nothing
releaser status   # repo, registry, and release state
releaser doctor   # run preflight checks
releaser scan     # find version occurrences in tracked files
releaser resume   # continue an interrupted release
```

Non-interactive:

```sh
releaser --bump patch --yes
releaser --version 2.0.0 --dry-run
releaser --bump prerelease --tag beta --no-interactive
```

## What it does

1. Reads repository, registry, and GitHub state.
2. Runs preflight checks — clean tree, upstream in sync, tag free, version
   free, auth valid.
3. Computes the next version and every file mutation it implies.
4. Collects commits and merged PRs since the previous release, categorized
   into structured release notes.
5. Shows the complete plan and a full diff, then asks.
6. Executes: mutate → commit → tag → push → publish → GitHub Release, each
   stage journalled and individually idempotent.

## Safety properties

- Planning never mutates anything.
- `--dry-run` invokes no write boundary at all.
- A plan is bound to a repository fingerprint; if the repo changed, the plan is
  rejected rather than silently re-planned.
- Every stage checks whether it already happened before doing it, so `resume`
  never duplicates work.
- A failed `npm publish` is resolved by querying the registry, never by blind
  retry.
- **The tool never runs `npm unpublish`.** After a partial failure it reports
  exactly what completed and how to finish.
- Secrets are redacted centrally, at the logger and journal writer.

## Configuration

`releaser.config.json` at the repository root, or a `releaser` key in
`package.json`.

```json
{
  "releaseBranch": "main",
  "remote": "origin",
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

`expectedMatches` is required. A replacement whose match count differs fails
planning — there is no replace-all mode.

## Scope

Single-package repositories, npm, GitHub. No monorepos, no other registries,
no other forges. See `SPEC.md` §2.

## Development

```sh
pnpm install
pnpm check     # typecheck + lint + format:check + test + build
```

Tooling is TypeScript 7 for typecheck and build, oxlint for linting, oxfmt for
formatting, and Vitest for tests. No ESLint, no Prettier, no bundler.

`SPEC.md` is the normative contract. `AGENTS.md` covers working conventions.
`prompts/` holds the implementation task sequence.
