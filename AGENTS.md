# AGENTS.md

Read `SPEC.md` before writing code. It is the normative contract. This file
covers how to work; `SPEC.md` covers what to build.

---

## Start of every task

1. Read `SPEC.md` and this file.
2. Inspect the existing implementation before adding to it.
3. Do not redesign completed areas unless the task explicitly requires it.
4. Run `bun run check` before considering the work complete.

---

## Code style

Standalone functions are `function` declarations, never arrows assigned to a
`const`. Callbacks — arguments to `map`, `setTimeout`, event handlers, prompt
handlers — are arrow functions.

Never leave a `catch` empty. To swallow deliberately, call `noop()` from
`shared/noop.ts`. If the error matters, handle it or log it.

When a file declares a single non-exported type, name it `Props`. Exported
types, or files with more than one type, get descriptive names.

No explanatory comments. Code explains itself through names, types, and
structure. The only acceptable comments are workarounds — where the *why*
cannot be expressed in code — and JSDoc on the public surface of shared
helpers. If you want to write an explanatory comment, rename something or
extract a well-named function instead.

Both rules are enforced by oxlint — `func-style: ["error", "declaration"]` and
`prefer-arrow-callback`. They are not suggestions; `bun run lint` fails on them.

Relative imports carry a `.js` extension, even when importing a `.ts` file —
`import { run } from './command-runner.js'`. This is required by
`module: nodenext` ESM resolution. An extensionless or `.ts` import will pass
some tools and fail at runtime.

---

## Testing

Use real temporary Git repositories for Git integration tests. Never operate
on this development repository.

Network-facing GitHub behaviour uses mocked or stubbed clients in automated
tests.

npm publication is always mocked, or run against a local Verdaccio registry.
No test publishes to the public registry.

Every bug fix includes a regression test when practical.

Scenarios that must be covered:

- dirty repository
- detached HEAD
- branch behind origin
- branch diverged from origin
- mismatching npm / Git / local versions
- invalid SemVer
- custom version lower than or equal to the current one
- existing tag, locally and on the remote
- already-published npm version
- replacement with zero matches
- replacement with more matches than expected
- GitHub release already exists
- interruption after each execution stage
- stale ReleasePlan
- journal already locked
- dry run
- prerelease tags and dist-tag selection
- npm OTP required
- lifecycle script failure

---

## Development commands

```
bun install           install dependencies
bun run typecheck     tsc --noEmit
bun run test          vitest run
bun run lint          oxlint
bun run format        oxfmt --write
bun run format:check  oxfmt --check
bun run build         tsc -p tsconfig.build.json
bun run check         all of the above
```

Bun is the package manager and script runner. The `dev` script still goes
through `tsx`, and the shipped CLI still runs on Node — the tool targets Node
24, so development must exercise Node's module resolution rather than Bun's.
Do not switch `dev` to `bun src/cli/index.ts`, and do not replace Vitest with
`bun test`.

Linting is oxlint, formatting is oxfmt — the oxc suite. Do not add ESLint,
Prettier, or Biome. `.oxlintrc.json` and `.oxfmtrc.json` are the only
lint/format configs; do not introduce per-directory overrides beyond the
`overrides` blocks already present.

`tests/fixtures/` is exempt from both. This is deliberate: `SPEC.md` §9.3
requires the tool to preserve a consumer's `package.json` key order and
indentation byte-for-byte, and oxfmt canonicalizes JSON key order. A formatter
run over the fixtures would rewrite the very bytes those tests assert on.
Never remove that exemption, and never "fix" a fixture's formatting.

Run `bun run check` before finishing. Fix everything it reports; do not hand back
work with known failures and a note about them.

---

## Scope discipline

Do not implement unrelated future capabilities. Specifically, do not introduce:

- generic plugin systems
- dependency-injection frameworks
- ORMs or databases
- web servers or dashboards
- React or any UI framework
- GitLab or Bitbucket support
- registries other than npm
- monorepo or workspace handling
- an AI SDK

Prefer straightforward code over theoretical extensibility. Leave clean module
boundaries that make future extension possible without building those
extensions today.

Git, npm, and GitHub are concrete infrastructure modules. They are not
implementations of an abstract provider interface.

---

## Boundaries you must not cross

- `domain/` imports no infrastructure and no third-party package except
  `semver`.
- Only `shared/command-runner.ts` invokes `execa`.
- Only `github/github-client.ts` invokes Octokit; raw responses never leave
  `github/`.
- No Git, npm, or GitHub write happens outside the executor.
- Planning performs no mutations of any kind.
- No secret is ever printed, journalled, or placed in error details.
- No repository-wide blind find-and-replace.

---

## Definition of quality

Code is not complete because the happy path works. Release software must fail
safely. For every operation, answer:

1. What if it already happened?
2. What if authentication fails?
3. What if the process dies immediately afterwards?
4. What if the repository changed since planning?
5. What can safely be retried?
6. What must never be retried blindly?
7. What does the user need to know in order to recover?

Safety and recoverability outrank brevity. A longer function that survives an
interrupted publish beats a shorter one that does not.

---

## Deliverable format

End every task with:

- files created or modified
- architecture decisions made
- commands verified
- anything intentionally left unimplemented, and why
