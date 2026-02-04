/**
 * worktree-creation.ts
 *
 * Utilities for creating Git worktrees
 */

import { git, localBranchExists, remoteBranchExists } from "./git.js";

/**
 * Fetch a remote branch if it exists on origin, ensuring the local
 * copy is up-to-date.
 *
 * When the local branch already exists, uses `git fetch origin
 * branch:branch` to fast-forward it in place. If the local branch
 * has diverged (unpushed commits), the fetch fails safely and the
 * local branch is kept as-is.
 *
 * When the local branch does not exist, fetches the remote tracking
 * ref only so that {@link createWorktree} can create the local branch
 * with proper `--track` configuration.
 */
export function fetchRemoteBranch(branch: string): void {
  if (!remoteBranchExists(branch)) return;

  console.log(`➤ Fetching origin/${branch} …`);
  if (localBranchExists(branch)) {
    try {
      git("fetch", "origin", `${branch}:${branch}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trimmed = message.trim();
      const firstLine = trimmed.split("\n")[0] ?? trimmed;

      const normalized = trimmed.toLowerCase();
      const looksLikeNonFastForward =
        normalized.includes("non-fast-forward") ||
        normalized.includes("rejected");

      if (looksLikeNonFastForward) {
        console.warn(
          `➤ Warning: local branch '${branch}' has diverged from origin/${branch}; using existing local branch as-is.`,
        );
        return;
      }

      console.warn(
        `➤ Warning: failed to update local branch '${branch}' from origin/${branch}: ${firstLine}. Using existing local branch.`,
      );
    }
  } else {
    git("fetch", "origin", branch);
  }
}

/**
 * Create a worktree for the given branch at the specified destination
 */
export function createWorktree(
  branch: string,
  destinationDirectory: string,
): void {
  if (localBranchExists(branch)) {
    // Reuse existing local branch
    console.log(`➤ git worktree add ${destinationDirectory} ${branch}`);
    git("worktree", "add", destinationDirectory, branch);
  } else if (remoteBranchExists(branch)) {
    // Create new local branch tracking the remote branch
    console.log(
      `➤ git worktree add --track -b ${branch} ${destinationDirectory} origin/${branch}`,
    );
    git(
      "worktree",
      "add",
      "--track",
      "-b",
      branch,
      destinationDirectory,
      `origin/${branch}`,
    );
  } else {
    // Create new branch in the worktree from current HEAD
    console.log(`➤ git worktree add -b ${branch} ${destinationDirectory}`);
    git("worktree", "add", "-b", branch, destinationDirectory);
  }
}
