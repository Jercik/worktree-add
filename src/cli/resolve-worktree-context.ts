import path from "node:path";
import { exitWithMessage, normalizeBranchName, toSafePathSegment } from "../git/git.js";
import {
  findWorktreeByBranchName,
  getCurrentWorktreeRoot,
  getRepositoryName,
  getSuperprojectRoot,
} from "../git/worktree-discovery.js";

interface WorktreeContext {
  readonly branch: string;
  readonly repoRoot: string;
  readonly destinationDirectory: string;
}

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
        "Open that worktree instead or remove it before retrying.\n" +
        "If that path no longer exists, run `git worktree prune` and retry.",
    );
  }

  const repoRoot = getCurrentWorktreeRoot();
  const superprojectRoot = getSuperprojectRoot();
  const repoName = getRepositoryName();
  const branchDirectorySegment = toSafePathSegment(branch);
  const destinationDirectory = path.join(
    superprojectRoot === undefined ? path.dirname(repoRoot) : path.dirname(superprojectRoot),
    `${repoName}-${branchDirectorySegment}`,
  );

  return { branch, repoRoot, destinationDirectory };
}
