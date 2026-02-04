/**
 * worktree-creation.ts
 *
 * Utilities for creating Git worktrees
 */

import { git, localBranchExists, remoteBranchExists } from "./git.js";

/**
 * Fetch a remote branch if it exists on origin, ensuring the local
 * copy is up-to-date. When a stale local branch exists it is deleted
 * first so the worktree is created from the latest remote state.
 *
 * Safety: this function is only called after the caller has verified
 * (via {@link findWorktreeByBranchName}) that no worktree has this
 * branch checked out. A branch that is not checked out anywhere
 * cannot have uncommitted changes, so deleting it is safe.
 */
export function fetchRemoteBranch(branch: string): void {
  if (!remoteBranchExists(branch)) return;

  if (localBranchExists(branch)) {
    console.log(`➤ Deleting stale local branch ${branch} …`);
    git("branch", "-D", branch);
  }

  console.log(`➤ Fetching origin/${branch} …`);
  git("fetch", "origin", branch);
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
