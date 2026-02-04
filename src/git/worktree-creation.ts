/**
 * worktree-creation.ts
 *
 * Utilities for creating Git worktrees
 */

import {
  fetchOriginBranch,
  getAheadBehindCounts,
  getLocalBranchHead,
  getRemoteBranchHead,
  git,
  localBranchExists,
  normalizeBranchName,
  remoteBranchExists,
} from "./git.js";

/**
 * Fetch a remote branch if it exists on origin, ensuring the local
 * copy is up-to-date.
 *
 * Non-interactive rules:
 * - Fetch the remote-tracking ref (`origin/<branch>`) for reliable comparisons.
 * - If a local branch exists and is strictly behind origin, fast-forward it.
 * - If a local branch is ahead/diverged, keep it as-is and warn.
 * - If fetching origin fails but the local branch exists, keep local and warn.
 */
export function fetchRemoteBranch(branch: string): boolean {
  const normalized = normalizeBranchName(branch);
  const remoteExists = remoteBranchExists(normalized);
  if (!remoteExists) return false;

  console.log(`➤ Fetching origin/${normalized} …`);

  if (localBranchExists(normalized)) {
    try {
      fetchOriginBranch(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trimmed = message.trim();
      const firstLine = trimmed.split("\n")[0] ?? trimmed;
      console.warn(
        `➤ Warning: failed to fetch origin/${normalized}: ${firstLine}. Using existing local branch.`,
      );
      return true;
    }

    const localHead = getLocalBranchHead(normalized);
    const remoteHead = getRemoteBranchHead(normalized);
    if (!localHead || !remoteHead || localHead === remoteHead) return true;

    const { ahead, behind } = getAheadBehindCounts(localHead, remoteHead);

    if (ahead === 0 && behind > 0) {
      console.log(
        `➤ Fast-forwarding local '${normalized}' to origin/${normalized} …`,
      );
      git("branch", "-f", "--", normalized, `origin/${normalized}`);
      return true;
    }

    const descriptors: string[] = [];
    if (ahead > 0) descriptors.push(`ahead by ${ahead}`);
    if (behind > 0) descriptors.push(`behind by ${behind}`);
    console.warn(
      `➤ Warning: local branch '${normalized}' has diverged from origin/${normalized} (${descriptors.join(" and ")}); using existing local branch as-is.`,
    );
    return true;
  }

  // No local branch: fetch origin/<branch> so createWorktree can create a tracking branch.
  fetchOriginBranch(normalized);
  return true;
}

/**
 * Create a worktree for the given branch at the specified destination
 */
export function createWorktree(
  branch: string,
  destinationDirectory: string,
  options?: { remoteBranchExists?: boolean },
): void {
  if (localBranchExists(branch)) {
    // Reuse existing local branch
    console.log(`➤ git worktree add ${destinationDirectory} ${branch}`);
    git("worktree", "add", destinationDirectory, branch);
  } else if (options?.remoteBranchExists ?? remoteBranchExists(branch)) {
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
