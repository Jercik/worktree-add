import { describe, expect, it } from "vitest";

import { formatDivergedBranchMessage } from "./format-diverged-branch-message.js";

describe("formatDivergedBranchMessage", () => {
  it("formats recovery steps for a diverged branch", () => {
    expect(
      formatDivergedBranchMessage({
        branch: "codex/implement-new-transform-from-workflow.md",
        ahead: 15,
        behind: 1,
      }),
    ).toBe(
      `Local branch 'codex/implement-new-transform-from-workflow.md' and origin/codex/implement-new-transform-from-workflow.md have diverged (ahead by 15 and behind by 1).
This can mean either a stale local branch-name collision or legitimate local commits plus new remote commits.
Refusing to reuse the local branch automatically.
Note: commands below use POSIX shell quoting. On Windows cmd.exe/PowerShell, adapt quoting for your shell.
If you want to keep local commits, use your local branch directly:
  git worktree add -- <path> 'codex/implement-new-transform-from-workflow.md'
  # or merge/rebase 'codex/implement-new-transform-from-workflow.md' with origin/codex/implement-new-transform-from-workflow.md, then retry.
To work on the remote branch, run:
  git fetch origin --prune
  # if '<branch>-old' already exists, pick a different archive name.
  git branch -m -- 'codex/implement-new-transform-from-workflow.md' 'codex/implement-new-transform-from-workflow.md-old'
  # or delete the stale local branch instead:
  # git branch -D -- 'codex/implement-new-transform-from-workflow.md'
  worktree-add -- 'codex/implement-new-transform-from-workflow.md'`,
    );
  });

  it("quotes apostrophes in shell command arguments", () => {
    expect(
      formatDivergedBranchMessage({
        branch: "feature/user's profile",
        ahead: 2,
        behind: 3,
      }),
    ).toContain(`git worktree add -- <path> 'feature/user'"'"'s profile'`);
  });
});
