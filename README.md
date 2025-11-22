# worktree-add

Create a Git worktree next to your current repo for a branch, copy useful local files, install deps, and open it in your editor.

## What it does

Running `worktree-add <branch>` from inside a repo:

1. Normalizes `<branch>` (supports `origin/foo`, `refs/heads/foo`, etc.).
2. Refuses if that branch is already checked out in any worktree.
3. Picks a destination next to your current repo: `../<repo>-<safe-branch>`.
4. If the destination exists, asks before removing it with `rm -rf`.
5. Fetches `origin/<branch>` when needed and creates a git worktree:
   - reuses an existing local branch
   - or creates a tracking branch from `origin/<branch>`
   - or creates a new branch from the current `HEAD`
6. Copies untracked / ignored files into the new worktree, skipping heavy stuff
   (`node_modules`, `dist`, `.next`, caches, virtualenvs, etc.).
7. Detects your package manager and installs dependencies with lockfile‑safe flags
   (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, etc.).
8. If the project uses Next.js and supports it, runs `next typegen`.
9. Opens the new worktree in your editor.

Your original checkout is left untouched.

## Requirements

- Node.js ≥ 22.14.0
- Git with `git worktree` support
- POSIX‑like shell (uses `rm -rf` for cleaning the destination)

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

## Editor control

By default the tool opens the new worktree in:

1. `--editor <command>` if passed
2. `WORKTREE_ADD_EDITOR` env var
3. otherwise `code`

Only simple command names are allowed (no `;`, `&`, pipes, etc.) to avoid shell injection. Examples:

```bash
worktree-add feature/foo -e code
WORKTREE_ADD_EDITOR=vim worktree-add feature/foo
```

If launching the editor fails, the worktree still stays created and ready.

Tip: add a shell helper with your preferred editor in `~/.zprofile` (or similar). Example snippet to add:

```bash
worktree-add() { WORKTREE_ADD_EDITOR=cursor command worktree-add "$@" }
```

Add it to your shell profile:

- zsh: `~/.zshrc` or `~/.zprofile`
- bash: `~/.bashrc` or `~/.bash_profile`
- fish: `~/.config/fish/config.fish`

## License

MIT
