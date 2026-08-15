# Task 02 — Git infrastructure

Read `AGENTS.md` and `SPEC.md` first.

Implement everything under `src/git/`. Use the real installed `git` executable
through `CommandRunner`. Do not use `simple-git` or any JavaScript Git
implementation.

Do not implement npm or GitHub in this task.

## Read operations

- detect the repository root, resolving symlinks
- current branch
- HEAD SHA
- working-tree status
- configured remotes, and parse the origin URL
- upstream ref for the current branch
- ahead / behind counts against upstream
- list tags, local and remote
- resolve the previous release tag matching the configured prefix
- commits between two refs
- changed files between two refs
- whether HEAD exists on the remote
- compute `RepositoryFingerprint` per `SPEC.md` §8.3

## Write operations

Isolated, individually callable, each idempotent per `SPEC.md` §7.3:

- create the release commit
- create the annotated tag
- push the branch
- push the tag

Never invoke a write operation from planning code.

Tag creation must fail — not move the tag — when the tag exists and points at a
different commit.

## Safety detection

Return structured results for: dirty tree, detached HEAD, missing remote,
wrong branch, behind upstream, diverged from upstream, existing tag locally,
existing tag on the remote.

Parse Git output inside `src/git/`. CLI and application code receive typed
values, never raw stdout.

Prefer machine-readable Git output — `--porcelain`, `-z`, `%x00` format
separators — over parsing human-facing text. Commit messages contain newlines;
a line-splitting parser will corrupt them.

## Tests

Create real temporary Git repositories in an OS temp directory, with a local
bare repo standing in for `origin`. Never touch this development repository.
Set `user.name`, `user.email`, and a deterministic committer date so tests are
reproducible.

Cover: clean repository, dirty repository, untracked files, tags, commits
since a tag, commit messages containing newlines and quotes, detached HEAD,
existing tag pointing elsewhere, branch ahead, branch behind, branch diverged,
no upstream, no remote.

Run `bun run check`.
