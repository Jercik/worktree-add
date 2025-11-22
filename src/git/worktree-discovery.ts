/**
 * worktree-discovery.ts
 *
 * Utilities for parsing Git worktree information
 */

import path from "node:path";
import { git } from "./git.js";

/**
 * Get the repository name from the main repository directory
 * Works universally across all Git setups (worktrees, bare repos, no remotes, etc.)
 */
export function getRepositoryName(): string {
  // Get the main worktree path from git worktree list
  const wtList = git("worktree", "list", "--porcelain");
  const mainLine = wtList.split(/\n/u).find((l) => l.startsWith("worktree "));

  if (mainLine) {
    // Extract path from "worktree /path/to/main/repo"
    const mainWorktreePath = mainLine.replace(/^worktree\s+/u, "").trim();
    return path.basename(mainWorktreePath);
  }

  // Fallback to current directory if worktree list fails
  const repoRoot = git("rev-parse", "--show-toplevel");
  return path.basename(repoRoot);
}

/**
 * Find the worktree path where the given branch is currently checked out.
 * Returns the worktree path if found, otherwise undefined.
 */
export function findWorktreeByBranchName(
  branchName: string,
): string | undefined {
  const wtList = git("worktree", "list", "--porcelain");
  const wtLines = wtList.split(/\n/u);

  let currentWorktreePath: string | undefined;

  for (const line of wtLines) {
    if (line.startsWith("worktree ")) {
      currentWorktreePath = line.replace(/^worktree\s+/u, "").trim();
    } else if (line.startsWith("branch ") && currentWorktreePath) {
      const referenceOrName = line.replace(/^branch\s+/u, "").trim();
      const shortName = referenceOrName.startsWith("refs/heads/")
        ? referenceOrName.slice("refs/heads/".length)
        : referenceOrName;
      if (shortName === branchName) {
        return currentWorktreePath;
      }
    }
  }

  return undefined;
}
