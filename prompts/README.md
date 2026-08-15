# Implementation prompts

One agent per file, in order. Never hand a single agent the whole spec.

```
00-scaffold.md      →  repo skeleton, CommandRunner contract, CLI entry
01-domain.md        →  domain model, versioning, ReleasePlan, planner
02-git.md         ┐
03-npm.md         ├─  may run in parallel — disjoint modules
04-github.md      ┘
05-versioning-notes.md  →  scanning, replacements, release notes
06-executor.md      →  stages, journal, resume, dry run
07-cli.md           →  wizard, commands, JSON output, end-to-end tests
```

## Parallelism

`02`, `03`, and `04` touch disjoint directories (`src/git/`, `src/npm/`,
`src/github/`) and may run concurrently — but only after `00` has landed and
the `shared/command-runner.ts` interface is frozen. Without that precondition
three agents will invent three incompatible process abstractions.

Do not parallelize anything else. `05` needs `02` and `04`; `06` needs
everything; `07` needs `06`.

## Preamble for every agent

Prepend this to each task:

> Read `AGENTS.md` and `SPEC.md` first.
> Inspect the existing implementation before adding to it.
> Do not redesign completed areas unless this task requires it.
> Run `bun run check` before finishing, and fix everything it reports.
