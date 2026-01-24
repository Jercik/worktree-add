/**
 * worktree-creation.ts
 *
 * Utilities for creating Git worktrees
 */

import {
  fetchOriginBranch,
  git,
  localBranchExists,
  remoteBranchExists,
} from "./git.js";

/**
 * Fetch a remote branch if it exists locally but not remotely
 */
export function fetchRemoteBranch(branch: string): void {
  if (!localBranchExists(branch) && remoteBranchExists(branch)) {
    console.log(`➤ Fetching origin/${branch} …`);
    fetchOriginBranch(branch);
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
