import path from "node:path";
import {
  exitWithMessage,
  findWorktreeByBranchName,
  getRepositoryName,
  git,
  normalizeBranchName,
  toSafePathSegment,
} from "../git/git.js";

export type WorktreeContext = {
  readonly branch: string;
  readonly repoRoot: string;
  readonly destinationDirectory: string;
};

export function resolveWorktreeContext(branchRaw: string): WorktreeContext {
  const branch = normalizeBranchName(branchRaw);
  if (branch.length === 0) {
    exitWithMessage(
      "Branch name is empty.\n" +
        "Examples: `feature/foo`, `origin/feature/foo`, `refs/heads/feature/foo`.\n" +
        "Note: `origin/` without a branch name is not valid.",
    );
  }

  const existingWorktree = findWorktreeByBranchName(branch);
  if (existingWorktree) {
    exitWithMessage(
      `Branch '${branch}' is already checked out in: ${existingWorktree}\n` +
        "You cannot add another worktree for the same branch.\n" +
        "Open that worktree instead or remove it before retrying.",
    );
  }

  const repoRoot = git("rev-parse", "--show-toplevel");
  const repoName = getRepositoryName();
  const branchDirectorySegment = toSafePathSegment(branch);
  const destinationDirectory = path.join(
    path.dirname(repoRoot),
    `${repoName}-${branchDirectorySegment}`,
  );

  return { branch, repoRoot, destinationDirectory };
}
