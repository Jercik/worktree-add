---
status: accepted
---

# After install, run `next typegen` on Next.js projects

When the destination has `next` in `dependencies` or `devDependencies`, after install the program probes `next --help` for a `typegen ` command. If the command exists, it runs `next typegen` through the package manager. If it does not, it warns and continues. If `next typegen` itself fails, the run fails and the new worktree is removed.

Łukasz decided now (2026-09-04) to keep that behavior. There was no earlier witness: the step is in the initial commit, the checkout-layout rule names create, copy, and install only, and zsh history, GitHub issues, npm dependents, and agent transcripts do not name the situation.

Rejected: skip typegen after install; try `next typegen` with no `--help` probe and ignore failure.
