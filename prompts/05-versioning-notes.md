# Task 05 — Version propagation and release notes

Read `AGENTS.md` and `SPEC.md` first. Requires tasks 02 and 04.

Implement `src/versioning/` and `src/notes/`. Respect the ownership map in
`SPEC.md` §4.1 — reading `package.json` belongs to `src/npm/package.ts` and
already exists; writing to it belongs here.

## Scanning

Implement `releaser scan`: search Git-tracked text files for the exact current
version string, and report occurrences with file, line, and column.

Scanning discovers. It never decides to mutate. There is no
"update everything it found" mode.

Exclusions per `SPEC.md` §9.1, plus binary-file detection and `.releaserignore`
in gitignore syntax.

## Replacements

Implement configured replacements: `file`, `find` (exact string or regex),
`replace` (supporting `{{version}}`, `{{previousVersion}}`, `{{major}}`,
`{{minor}}`, `{{patch}}`), and a required `expectedMatches`.

If the actual count differs from `expectedMatches`, planning fails with
`ReplacementMatchCount` naming the file, the pattern, the expected count, and
the actual count.

All proposed changes become `FileMutation` entries on the `ReleasePlan`. Never
mutate a file directly from this module — mutations are data until the
executor runs.

## Manifest and lockfile

Mutate `package.json` by targeted edit: preserve key order, indentation style
and width, and the trailing newline. Do not `JSON.parse` → `JSON.stringify`
the whole document, and do not regex the raw text.

Synchronize `package-lock.json` (`version` and `packages[""].version`).
`pnpm-lock.yaml` and `bun.lock` do not record the root version — leave them
untouched, and do not warn about them.

## Changes

Collect normalized commits from Git and merged PRs from GitHub across the
release boundary. Deduplicate: a merge commit and the PR it merged are one
change. Squash-merge commits carrying `(#123)` map to that PR.

## Notes

Produce a structured `ReleaseNotes` value using the fixed categories in
`SPEC.md` §10. Conventional-commit prefixes and PR labels improve
categorization when present; neither is required. Categorization is
deterministic.

Render GitHub-flavoured Markdown from the structured value as a pure function.
Escape user-controlled text — a commit message containing Markdown or an HTML
comment must not break or inject into the rendered body.

## AI

Create `src/notes/ai.ts` containing an interface only. No SDK dependency, no
network call, no implementation.

## Tests

Scanning and exclusions; binary detection; `.releaserignore`; zero-match and
over-match replacements; template placeholders; `package.json` formatting
preserved byte-for-byte apart from the version; lockfile sync; lockfile absent;
commit/PR deduplication; squash-merge PR association; categorization across
every category; deterministic ordering; Markdown escaping of hostile commit
messages; empty release boundary.

Run `pnpm check`.
