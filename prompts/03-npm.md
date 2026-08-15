# Task 03 — npm infrastructure

Read `AGENTS.md` and `SPEC.md` first.

Implement everything under `src/npm/`. Use the installed `npm` CLI through
`CommandRunner` for anything that is npm's own semantics — packing,
publishing, auth resolution. Do not use npm as a programmatic library, and do
not reimplement its packing or publication rules.

**No test may execute a real `npm publish` against the public registry.**

Do not implement Git or GitHub in this task.

## Package discovery

Read and validate `package.json`. Determine: package name, version, `private`,
`publishConfig`, `files`, and the package root. Validate with Zod at the IO
boundary.

Reading the manifest belongs here. *Writing* the version into it belongs to
`src/versioning/package-json.ts` (task 05) — do not implement mutation here.

## Registry state

Read-only operations to determine: whether the package exists, its published
versions, its `latest`, and whether a proposed version already exists.

Respect the repository's npm configuration — `.npmrc`, scoped registries —
by going through the npm CLI rather than hitting `registry.npmjs.org`
directly.

Distinguish "package does not exist" from "registry unreachable" from "not
authorized". Treating a 404 and a network failure alike will publish over
someone's package or block a legitimate release.

## Package inspection

Implement `npm pack --dry-run` and `npm publish --dry-run`, returning
structured results: file list, unpacked size, shasum, integrity.

## Publishing

Publication is represented separately from planning and is invoked only
through the executor-facing write boundary.

Support access `public` and `restricted`, and dist-tags `latest`, `beta`,
`next`, or a custom value. A prerelease must not update `latest` by default —
derive the tag per `SPEC.md` §5.

Implement, per `SPEC.md` §7.4, §7.5, §7.6:

- publish failure is journalled as **unknown**, never as failed, and resolved
  by re-querying the registry; blind retry is forbidden
- `EOTP` produces a typed `OtpRequired` error carrying whether a retry with
  `--otp` is possible
- a lifecycle-script failure (`prepublishOnly`, `prepack`, `prepare`,
  `postpublish`) is a distinct error kind naming the script and carrying its
  output, not a generic publish failure
- `EPUBLISHCONFLICT` maps to `VersionAlreadyPublished`

## Authentication

Use existing npm authentication and environment configuration. Do not invent a
credential system. Never print, log, or journal a token.

## Tests

Package discovery; private-package rejection; unpublished package; existing
versions; version already published; registry unreachable vs 404 vs 403;
dry-run command construction; dist-tag selection including prerelease defaults;
`EOTP` handling; lifecycle-script failure; `EPUBLISHCONFLICT`.

Mock the publish boundary for unit tests. If you add Verdaccio-backed
integration tests, gate them behind an env flag so the default `pnpm test`
stays offline and fast.

Run `pnpm check`.
