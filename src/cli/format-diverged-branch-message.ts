interface FormatDivergedBranchMessageOptions {
  readonly branch: string;
  readonly ahead: number;
  readonly behind: number;
}

const quoteForShell = (value: string): string => `'${value.replaceAll("'", "'\"'\"'")}'`;

export function formatDivergedBranchMessage({
  branch,
  ahead,
  behind,
}: FormatDivergedBranchMessageOptions): string {
  const branchForShell = quoteForShell(branch);
  const archivedBranchForShell = quoteForShell(`${branch}-old`);

  return (
    `Local branch '${branch}' and origin/${branch} have diverged (ahead by ${ahead} and behind by ${behind}).\n` +
    "This can mean either a stale local branch-name collision or legitimate local commits plus new remote commits.\n" +
    "Refusing to reuse the local branch automatically.\n" +
    "Note: commands below use POSIX shell quoting. On Windows cmd.exe/PowerShell, adapt quoting for your shell.\n" +
    "If you want to keep local commits, use your local branch directly:\n" +
    `  git worktree add -- <path> ${branchForShell}\n` +
    `  # or merge/rebase '${branch}' with origin/${branch}, then retry.\n` +
    "To work on the remote branch, run:\n" +
    "  git fetch origin --prune\n" +
    "  # if '<branch>-old' already exists, pick a different archive name.\n" +
    `  git branch -m -- ${branchForShell} ${archivedBranchForShell}\n` +
    "  # or delete the stale local branch instead:\n" +
    `  # git branch -D -- ${branchForShell}\n` +
    `  worktree-add -- ${branchForShell}`
  );
}
