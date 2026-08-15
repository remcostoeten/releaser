# Task 06 — Executor, journal, and resume

Read `AGENTS.md` and `SPEC.md` first. Requires tasks 01–05.

This is the task where the tool becomes safe or becomes dangerous. Implement
`src/journal/` and `application/execute-release-plan.ts` /
`application/resume-release.ts`.

## Journal

Implement per `SPEC.md` §8.

Location: `${XDG_STATE_HOME:-~/.local/state}/releaser/journals/<id>.json`,
where `<id>` is the first 16 hex chars of the SHA-256 of the resolved
repository root path. **Never inside the working tree or `.git/`** — a journal
in the tree gets committed by the release commit or deleted by
`git clean -xfd` during the exact recovery it exists to serve.

Locking: sibling `<id>.lock`, created with `O_EXCL`, containing the owning PID
and an ISO-8601 start time. Stale when the PID is dead or the entry is over an
hour old; breaking a stale lock logs a warning. A live lock produces
`JournalLocked`.

The journal is append-only and validated with Zod on read. A corrupt journal
is reported, never silently discarded.

Writes are atomic: write to a temp file in the same directory, `fsync`, then
`rename`. A crash mid-write must not truncate the journal.

## Stages

Implement the seven stages of `SPEC.md` §7.1 in that exact order:

```
mutate-files → commit → tag → push-branch → push-tag → npm-publish → github-release
```

The ordering is normative and derives from the irreversibility gradient in
§7.2. Do not reorder it. In particular `npm-publish` precedes
`github-release`: a GitHub Release pointing at an unpublished version misleads
consumers, whereas a published version with no GitHub Release is repairable by
`resume`.

Each stage:

- journals its **intent before** attempting the write, not only its result —
  a process killed mid-write must leave evidence that the write may have
  happened;
- runs the pre-check from §7.3 and skips if already done;
- journals its outcome as `succeeded`, `failed`, `skipped`, or `unknown`.

## npm publish

Implement §7.4 exactly. On any non-zero exit:

1. journal the attempt as `unknown` — never `failed`;
2. re-query the registry for the exact version;
3. if present, verify it is ours and mark succeeded;
4. if absent, mark failed and stop.

Blind retry of `npm publish` is forbidden. The registry is the only authority
on whether it landed.

Handle `EOTP` per §7.5: interactive retries once with `--otp`; non-interactive
fails with `OtpRequired`.

## Failure after publication

After `npm-publish` succeeds, do not pretend the release can be rolled back.

**Never run `npm unpublish`** — not on failure, not behind a flag.

Produce a `PartialReleaseError` stating: which stages completed, which failed
and why, which remain, and the exact `releaser resume` invocation that finishes
the job. Exit code 5.

## Staleness

Before executing or resuming, recompute the `RepositoryFingerprint` and
compare all four fields. Any mismatch is `StalePlanError` naming the changed
field. Never silently re-plan a stale plan.

## Signals

Per §7.7: `SIGINT`/`SIGTERM` flush the journal before exit, exit 5, and print
the resume instruction. A second Ctrl-C must not be required during a network
call.

## Dry run

Per §7.8: no persistent write of any kind, including to the journal. Read-only
checks and `npm pack --dry-run` / `npm publish --dry-run` are permitted.

## Resume

`resume-release.ts` loads the journal, validates the plan is not stale,
determines the first incomplete stage, and continues from there. Stages
already recorded as succeeded are re-verified by their §7.3 pre-check, not
trusted blindly — the journal can be older than the world it describes.

A stage recorded as `unknown` is resolved by its pre-check before anything
else runs.

## Tests

This is the highest-value test suite in the project.

- interruption after **each** of the seven stages: resume completes the release
  and duplicates nothing
- interruption *during* `npm-publish` with the publish having landed: resume
  detects it via the registry and does not republish
- interruption during `npm-publish` with the publish having failed: resume
  retries it
- a `failed` publish whose version is present on the registry resolves to
  succeeded
- stale plan rejected, once per fingerprint field
- journal locked by a live PID → `JournalLocked`
- journal locked by a dead PID → lock broken, warning logged
- corrupt journal reported, not discarded
- atomic write: a truncated temp file does not damage the existing journal
- dry run invokes zero write-boundary functions — assert against the recording
  fake
- `SIGINT` mid-execution leaves a resumable journal
- no code path anywhere invokes `npm unpublish` — assert this

Run `pnpm check`.

Do not implement the interactive wizard in this task.
