# worktree-add

Create a Git worktree next to your current repo for a branch, copy useful local files, install deps, and open it in your apps.

## What it does

Running `worktree-add <branch>` from inside a repo:

1. Normalizes `<branch>` (supports `origin/foo`, `refs/heads/foo`, etc.).
2. Refuses if that branch is already checked out in any worktree.
3. Fetches `origin/<branch>` and refreshes your local branch when safe:
   - fast-forwards the local branch if it’s strictly behind `origin/<branch>`
   - warns and keeps the local branch as-is if it’s ahead/diverged
4. Picks a destination next to your current repo: `../<repo>-<safe-branch>`.
5. If the destination exists, asks before moving it to the system trash.
6. Creates a git worktree:
   - reuses an existing local branch
   - or creates a tracking branch from `origin/<branch>`
   - or creates a new branch from the current `HEAD`
7. Copies untracked / ignored files into the new worktree, skipping heavy stuff
   (`node_modules`, `dist`, `.next`, caches, virtualenvs, etc.).
8. Detects your package manager and installs dependencies with lockfile‑safe flags
   (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, etc.).
9. If the project uses Next.js and supports it, runs `next typegen`.
10. Opens the new worktree in your requested apps (if any).

Your original checkout is left untouched.

## Requirements

- Node.js ≥ 22.14.0
- Git with `git worktree` support

## Install / run

You usually don’t need a global install.

```bash
# inside /my/path/my-app
# one‑off
npx worktree-add feature/my-branch

# or install globally
pnpm add -g worktree-add   # or: npm i -g worktree-add
worktree-add feature/my-branch
```

Run it from anywhere inside an existing worktree of the repo.

## Usage

```bash
# inside /my/path/my-app
worktree-add <branch>
```

Run this inside an existing worktree of your project—the tool discovers the repo root from your current directory and creates the sibling worktree next to it.

Example:

```bash
# inside /my/path/my-app
# reuses a local branch, tracks origin/<branch> if it exists, otherwise creates a new branch from current HEAD
worktree-add feature/login-form
```

A new branch from the current HEAD is created only when the branch does not already
exist locally or on `origin/`.

Destination directory (assuming repo named `my-app`):

```text
/my/path/my-app                     # current checkout
/my/path/my-app-feature-login-form  # new worktree for branch "feature/login-form"
```

## App control

After creating the worktree, the tool can open it in one or more apps. Nothing is opened by default.
App names are executed on your machine (as application/executable names), so only use values you trust.
Arguments are not parsed: values like `code -w` are treated as part of the app name and will likely fail.

1. `--app <name>` flag (repeatable): `worktree-add feature/foo --app ghostty --app code`
2. `WORKTREE_ADD_APP` env var (comma-separated): `WORKTREE_ADD_APP=ghostty,code worktree-add feature/foo`

CLI flags take priority over the env var.
To explicitly open nothing even when `WORKTREE_ADD_APP` is set, pass `--app ""`.

If launching an app fails, the worktree still stays created and ready.

Platform note: on macOS the app value is passed to `open -a`, so use an application name like `Visual Studio Code` (or an `.app` path). On Linux/Windows it’s typically treated as an executable name/path.

Tip: add a shell helper with your preferred apps in your shell profile:

```bash
worktree-add() { WORKTREE_ADD_APP=ghostty,code command worktree-add "$@" }
```

Add it to your shell profile:

- zsh: `~/.zshrc` or `~/.zprofile`
- bash: `~/.bashrc` or `~/.bash_profile`
- fish: `~/.config/fish/config.fish`

## License

MIT
