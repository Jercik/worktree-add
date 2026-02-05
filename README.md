# worktree-add

Create a Git worktree next to your current repo for a branch, copy useful local files, install deps, and open it in your apps.

## What it does

Running `worktree-add <branch>` from inside a repo:

1. Normalizes `<branch>` (supports `origin/foo`, `refs/heads/foo`, etc.).
2. Refuses if that branch is already checked out in any worktree.
3. Picks a destination next to your current repo: `../<repo>-<safe-branch>`.
4. If the destination exists, requires `--interactive` to confirm or `--yes` to move it to the system trash.
5. Fetches `origin/<branch>` and refreshes your local branch when safe:
   - fast-forwards the local branch if it’s strictly behind `origin/<branch>`
   - warns and keeps the local branch as-is if it’s ahead/diverged
6. Creates a git worktree:
   - reuses an existing local branch
   - or creates a tracking branch from `origin/<branch>`
   - or creates a new branch from the current `HEAD` (only when the branch does not exist on `origin/`, or when you pass `--offline` and `origin/` can’t be reached)
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
- Git credentials configured for `origin/` (the tool is non-interactive and won’t prompt for authentication)

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
worktree-add <branch> [options]
```

Run this inside an existing worktree of your project—the tool discovers the repo root from your current directory and creates the sibling worktree next to it.

Example:

```bash
# inside /my/path/my-app
# reuses a local branch, tracks origin/<branch> if it exists, otherwise creates a new branch from current HEAD
worktree-add feature/login-form
```

Common options:

```text
  -a, --app <name>   Open the worktree in an app (repeatable)
  --offline          Create from HEAD when origin can't be reached
  -y, --yes          Skip confirmation and replace existing destination
  --interactive      Allow confirmation prompts (requires a TTY)
  --dry-run          Show what would happen without making changes
  --verbose          Show progress messages on stderr
```

A new branch from the current HEAD is created only when the branch does not already
exist locally or on `origin/`. If `origin/` can’t be reached and the branch doesn’t exist locally, the tool aborts unless you pass `--offline`.

Destination directory (assuming repo named `my-app`):

```text
/my/path/my-app                     # current checkout
/my/path/my-app-feature-login-form  # new worktree for branch "feature/login-form"
```

## Pipeline examples

```bash
# create a worktree for the newest local branch
git for-each-ref --sort=-committerdate --format="%(refname:short)" refs/heads \
  | head -n1 \
  | xargs worktree-add

# create a worktree for the first feature branch
git branch --format="%(refname:short)" \
  | grep '^feature/' \
  | head -n1 \
  | xargs worktree-add
```

## App control

After creating the worktree, the tool can open it in one or more apps. Nothing is opened by default.
App names are executed on your machine (as application/executable names), so only use values you trust.
The app-name validation is a guardrail, not a security boundary.
The guardrail only blocks control characters; other punctuation is allowed because apps are launched without a shell. If that ever changes, this behavior should be revisited.
Arguments are not parsed: values like `code -w` are treated as part of the app name and will likely fail.

1. `--app <name>` flag (repeatable): `worktree-add feature/foo --app ghostty --app code`
2. `WORKTREE_ADD_APP` env var (comma-separated): `WORKTREE_ADD_APP=ghostty,code worktree-add feature/foo`

CLI flags take priority over the env var.
To explicitly open nothing even when `WORKTREE_ADD_APP` is set, pass `--app ""`.
Whitespace-only values like `--app "   "` are treated as absent and do not override `WORKTREE_ADD_APP`.

If launching an app fails, the worktree still stays created and ready.

Platform note: on macOS the app value is passed to `open -a`, so use an application name like `Visual Studio Code` (or an `.app` path). On Linux/Windows it’s typically treated as an executable name/path.

Terminal-based editors (vim/nvim/nano) are not supported via `--app` — apps are launched detached from the current terminal.

Tip: add a shell helper with your preferred apps in your shell profile:

```bash
worktree-add() { WORKTREE_ADD_APP=ghostty,code command worktree-add "$@" }
```

Add it to your shell profile:

- zsh: `~/.zshrc` or `~/.zprofile`
- bash: `~/.bashrc` or `~/.bash_profile`
- fish: `~/.config/fish/config.fish`

## Agent rule

If you are an automated agent, read and follow `AGENTS.md` (and `CLAUDE.md` if present) at the repo root before making changes.

## License

MIT
