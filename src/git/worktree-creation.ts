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
 * Uses `git fetch origin branch:branch` which fast-forwards the local
 * ref to match the remote. If the local branch has diverged (unpushed
 * commits), the fetch fails safely and the local branch is kept as-is
 * — {@link createWorktree} will then use the existing local branch.
 */
export function fetchRemoteBranch(branch: string): void {
  if (!remoteBranchExists(branch)) return;

  console.log(`➤ Fetching origin/${branch} …`);
  try {
    git("fetch", "origin", `${branch}:${branch}`);
  } catch {
    // Local branch has diverged from remote — keep local as-is
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
