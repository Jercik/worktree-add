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

export type RemoteBranchStatus = "exists" | "missing" | "unknown";

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
 * Note: fast-forwarding updates the local branch head before worktree creation.
 * If `git worktree add` fails later, the branch update still stands.
 *
 * @returns A status object indicating whether the branch exists on origin
 *          (`exists`/`missing`) or could not be confirmed (`unknown`, e.g.
 *          connectivity/auth issues), plus whether a local branch exists.
 *
 * Note: when a local branch already exists and `remoteBranchExists()` succeeds
 * (i.e. origin was reachable and the branch exists), a subsequent
 * `fetchOriginBranch()` failure still reports `status: "exists"`, since the
 * existence check already succeeded and callers typically only need a hint to
 * avoid re-querying origin.
 */
export function fetchRemoteBranch(branch: string): {
  status: RemoteBranchStatus;
  localExists: boolean;
} {
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
      return { status: "unknown", localExists };
    }

    if (!remoteExists) return { status: "missing", localExists };

    try {
      console.log(`➤ Fetching origin/${normalized} …`);
      fetchOriginBranch(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      console.warn(
        `➤ Warning: failed to fetch origin/${normalized}: ${diagnostic}. Using existing local branch.`,
      );
      return { status: "exists", localExists };
    }

    const localHead = getLocalBranchHead(normalized);
    const remoteHead = getRemoteBranchHead(normalized);
    if (!localHead || !remoteHead || localHead === remoteHead) {
      return { status: "exists", localExists };
    }

    const { ahead, behind } = getAheadBehindCounts(localHead, remoteHead);

    if (ahead === 0 && behind > 0) {
      console.log(
        `➤ Fast-forwarding local '${normalized}' to origin/${normalized} …`,
      );
      git("branch", "-f", "--", normalized, `origin/${normalized}`);
      return { status: "exists", localExists };
    }

    if (ahead === 0 && behind === 0) {
      console.warn(
        `➤ Warning: local branch '${normalized}' differs from origin/${normalized} (unexpected ahead/behind: 0 and 0). This can indicate unrelated histories or corrupted/shallow refs. Using existing local branch as-is.`,
      );
      return { status: "exists", localExists };
    }

    const descriptors: string[] = [];
    if (ahead > 0) descriptors.push(`ahead by ${ahead}`);
    if (behind > 0) descriptors.push(`behind by ${behind}`);

    const relationship = behind > 0 ? "has diverged from" : "is ahead of";
    console.warn(
      `➤ Warning: local branch '${normalized}' ${relationship} origin/${normalized} (${descriptors.join(" and ")}); using existing local branch as-is.`,
    );
    return { status: "exists", localExists };
  }

  let remoteExists: boolean;
  try {
    remoteExists = remoteBranchExists(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    console.warn(
      `➤ Warning: failed to reach origin to check whether '${normalized}' exists: ${diagnostic}. (If you expected a remote branch, double-check your network connection and branch name.)`,
    );
    return { status: "unknown", localExists };
  }

  if (!remoteExists) return { status: "missing", localExists };

  console.log(`➤ Fetching origin/${normalized} …`);
  try {
    fetchOriginBranch(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    throw new Error(
      `Failed to fetch origin/${normalized}: ${diagnostic}. Cannot proceed without a local branch.`,
    );
  }
  return { status: "exists", localExists };
}

/**
 * Create a worktree for the given branch at the specified destination
 */
export function createWorktree(
  branch: string,
  destinationDirectory: string,
  options?: { remoteBranchExists?: boolean },
): void {
  // Normalize defensively: callers (including the CLI) often pre-normalize, but
  // keeping this function robust for other call sites is worth the tiny cost.
  const normalized = normalizeBranchName(branch);

  if (localBranchExists(normalized)) {
    // Reuse existing local branch
    console.log(
      `➤ git worktree add -- ${destinationDirectory} refs/heads/${normalized}`,
    );
    // Avoid option-parsing ambiguity for branch names starting with '-'.
    git(
      "worktree",
      "add",
      "--",
      destinationDirectory,
      `refs/heads/${normalized}`,
    );
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
      `➤ git worktree add --track -b ${normalized} -- ${destinationDirectory} origin/${normalized}`,
    );
    git(
      "worktree",
      "add",
      "--track",
      "-b",
      normalized,
      "--",
      destinationDirectory,
      `origin/${normalized}`,
    );
    return;
  }

  // Create new branch in the worktree from current HEAD
  console.log(`➤ git worktree add -b ${normalized} -- ${destinationDirectory}`);
  git("worktree", "add", "-b", normalized, "--", destinationDirectory);
}
