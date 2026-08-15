# Task 00 — Scaffold the repository

Read `AGENTS.md` and `SPEC.md` first.

Create the repository skeleton and nothing more. Do not implement release
behaviour, Git operations, npm publishing, GitHub releases, version mutation,
or AI functionality in this task.

## Already present

`package.json`, `tsconfig.json`, `tsconfig.build.json`, `.oxlintrc.json`,
`.oxfmtrc.json`, `vitest.config.ts`, `.gitignore`, `README.md`, `SPEC.md`,
`AGENTS.md`.

Do not redesign these. If one is wrong, say so in your deliverable rather than
silently rewriting it.

## Create

1. `src/cli/index.ts` — entrypoint with a `#!/usr/bin/env node` shebang
2. `src/cli/create-program.ts` — Commander program construction
3. `src/cli/commands/` — `releaser`, `plan`, `status`, `doctor`, `scan`,
   `resume`, each responding with a clearly marked "not implemented" message
4. `src/shared/command-runner.ts` — the process-execution abstraction
5. `src/shared/logger.ts` — logging abstraction
6. `src/shared/redaction.ts` — secret redaction pass
7. `src/shared/noop.ts` — `noop()` for deliberate no-op catch blocks
8. `src/domain/` — initial type files, types only, no logic
9. `src/config/schema.ts` — Zod config schema placeholder
10. `tests/helpers/setup.ts` — Vitest setup file
11. `tests/unit/` — one trivial unit test
12. `tests/integration/` — one CLI smoke test asserting `--help` exits 0

## CommandRunner contract

This interface is frozen once this task lands — tasks 02, 03, and 04 build on
it in parallel and cannot renegotiate it. Design it deliberately.

It must:

- be the only place in the codebase that imports `execa`;
- accept a command, an argument array, and options (cwd, env, timeout,
  stdin input);
- return a structured result: exit code, stdout, stderr, the command as
  executed, and duration;
- never throw a raw execa error — convert to a typed application error;
- pass all captured output through `redaction.ts` before it is returned;
- be trivially substitutable in tests with a recording fake, without a DI
  framework — a plain interface plus constructor parameter is enough.

Provide the fake alongside it, in `tests/helpers/`.

## Logger contract

Levels: `debug`, `info`, `warn`, `error`. A `--json` mode where human output is
suppressed and structured records go to stderr. Every logged object passes
through redaction. No direct `console.log` outside `src/cli/` and `src/ui/`.

## Architectural requirements

Commander only parses input and dispatches. No release logic in an action
callback.

`src/domain/` must not import Commander, Clack, execa, Octokit, `node:fs`,
`node:process`, or `process.env`.

Do not create generic provider interfaces for hypothetical ecosystems. Git,
npm, and GitHub are concrete modules.

Dependency direction per `SPEC.md` §4.

## Verify

Both must work:

```sh
pnpm dev --help
node dist/cli/index.js --help
```

Then:

```sh
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Fix all issues.

## Deliverable

Files created; architecture decisions made; commands verified; anything
intentionally left unimplemented.

Include the final `CommandRunner` interface verbatim in your report — later
agents depend on it.
