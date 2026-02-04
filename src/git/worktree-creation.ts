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

function extractDiagnosticLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const trimmed = message.trim();
  const nonEmptyLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    nonEmptyLines.find((line) => /(?:^|\s)(?:fatal:|error:)/iu.test(line)) ??
    nonEmptyLines.at(-1) ??
    trimmed
  );
}

/**
 * Fetch a remote branch if it exists on origin, ensuring the local
 * copy is up-to-date.
 *
 * Non-interactive rules:
 * - Fetch the remote-tracking ref (`origin/<branch>`) for reliable comparisons.
 * - If a local branch exists and is strictly behind origin, fast-forward it.
 * - If a local branch is ahead/diverged, keep it as-is and warn.
 * - If fetching origin fails but the local branch exists, keep local and warn.
 *
 * @returns `true` when the branch is confirmed to exist on origin, otherwise
 *          `false` (does not exist or could not be confirmed due to origin
 *          connectivity/auth issues).
 *
 * Note: when a local branch already exists and `remoteBranchExists()` succeeds
 * (i.e. origin was reachable and the branch exists), a subsequent
 * `fetchOriginBranch()` failure still returns `true`, since callers typically
 * only need the return value as a hint to avoid re-querying origin.
 */
export function fetchRemoteBranch(branch: string): boolean {
  const normalized = normalizeBranchName(branch);
  const localExists = localBranchExists(normalized);

  if (localExists) {
    let remoteExists: boolean;
    try {
      remoteExists = remoteBranchExists(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      console.warn(
        `➤ Warning: failed to query origin for '${normalized}': ${diagnostic}. Using existing local branch.`,
      );
      return false;
    }

    if (!remoteExists) return false;

    try {
      console.log(`➤ Fetching origin/${normalized} …`);
      fetchOriginBranch(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      console.warn(
        `➤ Warning: failed to fetch origin/${normalized}: ${diagnostic}. Using existing local branch.`,
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
    if (descriptors.length === 0) descriptors.push("commits differ");
    console.warn(
      `➤ Warning: local branch '${normalized}' has diverged from origin/${normalized} (${descriptors.join(" and ")}); using existing local branch as-is.`,
    );
    return true;
  }

  let remoteExists: boolean;
  try {
    remoteExists = remoteBranchExists(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    console.warn(
      `➤ Warning: failed to reach origin to check whether '${normalized}' exists: ${diagnostic}. Creating a new local branch from current HEAD. (If you expected a remote branch, double-check your network connection and branch name.)`,
    );
    return false;
  }

  if (!remoteExists) return false;

  console.log(`➤ Fetching origin/${normalized} …`);
  try {
    fetchOriginBranch(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    throw new Error(
      `Failed to fetch origin/${normalized}: ${diagnostic}. Cannot proceed without a local branch.`,
    );
  }
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
  const normalized = normalizeBranchName(branch);

  if (localBranchExists(normalized)) {
    // Reuse existing local branch
    console.log(
      `➤ git worktree add ${destinationDirectory} refs/heads/${normalized}`,
    );
    // Avoid option-parsing ambiguity for branch names starting with '-'.
    git("worktree", "add", destinationDirectory, `refs/heads/${normalized}`);
    return;
  }

  let branchExistsOnOrigin = options?.remoteBranchExists;
  if (branchExistsOnOrigin === undefined) {
    try {
      branchExistsOnOrigin = remoteBranchExists(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      throw new Error(
        `Failed to reach origin to check whether '${normalized}' exists: ${diagnostic}`,
      );
    }
  }

  if (branchExistsOnOrigin) {
    // Create new local branch tracking the remote branch
    console.log(
      `➤ git worktree add --track -b ${normalized} ${destinationDirectory} origin/${normalized}`,
    );
    git(
      "worktree",
      "add",
      "--track",
      "-b",
      normalized,
      destinationDirectory,
      `origin/${normalized}`,
    );
    return;
  }

  // Create new branch in the worktree from current HEAD
  console.log(`➤ git worktree add -b ${normalized} ${destinationDirectory}`);
  git("worktree", "add", "-b", normalized, destinationDirectory);
}
