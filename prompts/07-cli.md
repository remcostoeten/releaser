# Task 07 — Interactive CLI and integration

Read `AGENTS.md` and `SPEC.md` first. Requires tasks 00–06.

The release engine already exists. Wire it up. Do not move business logic into
CLI commands — a command action parses input, calls one application function,
and renders the result.

Commander for commands and arguments. `@clack/prompts` for interactive UI.

## `releaser` — the wizard

1. discover the repository
2. display current state — branch, version, last release, commits since
3. run preflight and display results
4. show changes since the previous release
5. ask for the bump: patch, minor, major, prerelease, custom
6. generate the `ReleasePlan`
7. display the complete plan — every mutation, every action
8. offer to show the full file diff
9. confirm
10. execute, with per-stage progress
11. display results, including the published URL and release URL

Cancelling at any prompt exits cleanly with code 4, having mutated nothing.
A blocking preflight failure exits 3 without offering to continue, except
where `SPEC.md` §6 marks the check overridable.

## Commands

Wire `releaser`, `releaser plan`, `releaser scan`, `releaser status`,
`releaser doctor`, `releaser resume`.

## Non-interactive

Support `--bump`, `--version`, `--tag`, `--dry-run`, `--yes`,
`--no-interactive`, `--json`, `--otp`, `--cwd`, `--verbose`.

No command may prompt when `--yes`, `--no-interactive`, or `--json` is set. If
required information is missing under those flags, fail immediately naming the
missing flag. A CI run that silently blocks on a hidden prompt is a bug, and
there is a test for it.

Detect a non-TTY stdin and behave as `--no-interactive` rather than hanging.

## Output

Human TTY output is concise and scannable. Colour only when the stream is a
TTY and `NO_COLOR` is unset.

`--json` writes valid JSON to stdout and nothing else — no spinners, no
colour, no progress. Human-facing progress goes to stderr. `release --json`
piped to `jq` must work at every stage of a release.

Exit codes per `SPEC.md` §12.1.

Secrets are never displayed, in either mode.

## Errors

Render typed application errors with their `remediation` string. A user who
hits `BranchBehind` should be told to pull, not shown a stack trace. Stack
traces appear only under `--verbose`.

## Tests

Test command parsing separately from application behaviour — parsing tests
should not touch a repository.

End-to-end tests use temporary repositories with a bare-repo origin, and
mocked npm and GitHub write boundaries.

Cover: `--help` and `--version`; every command's parsing; conflicting flags
(`--bump` with `--version`); missing information under `--no-interactive`;
non-TTY stdin; cancellation at each prompt mutating nothing; `--json` output
validity for every command; `--json` emitting nothing but JSON on stdout
during a full release; exit code for each class in §12.1; a full dry-run
release end to end; a full mocked release end to end; a resumed release end to
end.

Run `pnpm check`.
