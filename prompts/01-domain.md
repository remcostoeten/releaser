# Task 01 — Domain model and release planning

Read `AGENTS.md` and `SPEC.md` first.

Implement the domain model required to represent a complete release before it
is executed, plus the planner that builds one. Do not implement Git, npm, or
GitHub infrastructure in this task — consume their interfaces, defining
minimal read-only ports where necessary.

## Concepts

Strongly typed representations for:

`RepositoryState`, `RepositoryFingerprint`, `ReleaseBoundary`,
`ReleaseVersion`, `FileMutation`, `ReleaseCheck`, `ReleaseNotes`,
`GitCommitAction`, `GitTagAction`, `GitPushAction`, `NpmPublishAction`,
`GitHubReleaseAction`, `ReleasePlan`.

Use discriminated unions wherever an operation has multiple states or kinds.
Avoid optional-property soup: a field that is only meaningful in one variant
belongs in that variant, not as an optional on a shared shape.

`ReleasePlan` is immutable and carries the `RepositoryFingerprint` it was
computed against — see `SPEC.md` §8.3. All four fingerprint fields are
required.

## Versioning

Implement, using the `semver` package — do not hand-roll comparison:

- validate
- compare
- bump patch / minor / major / prerelease
- accept an explicit custom version
- derive the default dist-tag for a prerelease per `SPEC.md` §5

Reject a proposed version that is not strictly greater than both the local
manifest version and the highest published version. When the package is
unpublished, only the manifest constrains it.

## Serialization

`ReleasePlan` serializes to JSON losslessly and round-trips.

Add a Zod schema in the appropriate IO-boundary module that validates a
serialized plan. Do not make `domain/` depend on Zod — the domain declares the
types, the boundary validates the wire format. If that means restating the
shape once, restate it, and add a type-level assertion that the two agree so
they cannot drift silently.

## Planner

Implement `application/create-release-plan.ts`.

Infrastructure dependencies are supplied explicitly as parameters. The planner
may use read-only dependencies only. It performs no mutations of any kind —
no file writes, no journal writes, no network writes.

It produces a `ReleasePlan` plus the list of `ReleaseCheck` results from
preflight (`SPEC.md` §6). A blocking check does not throw; it is returned, and
the caller decides.

## Tests

- version bumping across all kinds
- invalid SemVer input
- prerelease handling and dist-tag derivation
- custom version equal to, and below, current — both rejected
- unpublished-package path
- plan serialization round-trip
- plan schema rejects missing and malformed fields
- fingerprint mismatch detection for each of the four fields
- the planner performs no writes — assert against a recording fake, not by
  inspection

Run `pnpm check`.

Do not continue into Git, npm, or GitHub implementation.
