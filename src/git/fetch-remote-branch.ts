import type { StatusLogger } from "../output/create-status-logger.js";
import { getStatusLogger } from "../output/get-status-logger.js";
import {
  fetchOriginBranch,
  getAheadBehindCounts,
  getLocalBranchHead,
  getRemoteBranchHead,
  git,
  findWorktreeByBranchName,
  localBranchExists,
  normalizeBranchName,
  remoteBranchExists,
} from "./git.js";
import { extractDiagnosticLine } from "./extract-diagnostic-line.js";

export type RemoteBranchStatus = "exists" | "missing" | "unknown";

export function fetchRemoteBranch(
  branch: string,
  options?: { dryRun?: boolean; logger?: StatusLogger },
): {
  status: RemoteBranchStatus;
  localExists: boolean;
} {
  const logger = getStatusLogger(options?.logger);
  const dryRun = options?.dryRun ?? false;
  const normalized = normalizeBranchName(branch);
  const localExists = localBranchExists(normalized);

  if (localExists) {
    let remoteExists: boolean;
    try {
      remoteExists = remoteBranchExists(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      logger.warn(
        `Failed to query origin for '${normalized}': ${diagnostic}. Using existing local branch. (If you expected a remote branch, double-check your network connection and branch name.)`,
      );
      return { status: "unknown", localExists };
    }

    if (!remoteExists) return { status: "missing", localExists };

    try {
      if (dryRun) {
        logger.step(`Would fetch origin/${normalized}`);
        logger.detail(
          `Dry run: local '${normalized}' may be fast-forwarded after fetch if it is behind origin/${normalized}.`,
        );
        return { status: "exists", localExists };
      }
      logger.step(`Fetching origin/${normalized} …`);
      fetchOriginBranch(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      logger.warn(
        `Failed to fetch origin/${normalized}: ${diagnostic}. Using existing local branch (origin status unknown).`,
      );
      return { status: "unknown", localExists };
    }

    const localHead = getLocalBranchHead(normalized);
    const remoteHead = getRemoteBranchHead(normalized);
    if (!localHead || !remoteHead || localHead === remoteHead) {
      return { status: "exists", localExists };
    }

    let counts: { ahead: number; behind: number };
    try {
      counts = getAheadBehindCounts(localHead, remoteHead);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      logger.warn(
        `Failed to compare local '${normalized}' with origin/${normalized}: ${diagnostic}. Using existing local branch as-is.`,
      );
      return { status: "exists", localExists };
    }
    const { ahead, behind } = counts;

    if (ahead === 0 && behind > 0) {
      // Note: dryRun returns before fetching, so this path only runs when dryRun is false.
      // resolveWorktreeContext already blocks this, but keep as a defensive check.
      const activeWorktree = findWorktreeByBranchName(normalized);
      if (activeWorktree) {
        logger.warn(
          `Local branch '${normalized}' is checked out in ${activeWorktree}; skipping fast-forward.`,
        );
        return { status: "exists", localExists };
      }
      logger.detail(
        `Fast-forwarding '${normalized}' from ${localHead} to ${remoteHead}.`,
      );
      logger.step(
        `Fast-forwarding local '${normalized}' to origin/${normalized} …`,
      );
      git("branch", "-f", "--", normalized, `origin/${normalized}`);
      return { status: "exists", localExists };
    }

    if (ahead === 0 && behind === 0) {
      // Defensive: rev-list should report differences when heads differ,
      // but shallow/corrupted refs can yield 0/0 counts.
      logger.warn(
        `Local branch '${normalized}' differs from origin/${normalized}, but Git reports no ahead/behind differences. Using existing local branch; if you encounter issues, try re-cloning the repository.`,
      );
      return { status: "exists", localExists };
    }

    const descriptors: string[] = [];
    if (ahead > 0) descriptors.push(`ahead by ${ahead}`);
    if (behind > 0) descriptors.push(`behind by ${behind}`);

    const relationship = behind > 0 ? "has diverged from" : "is ahead of";
    logger.warn(
      `Local branch '${normalized}' ${relationship} origin/${normalized} (${descriptors.join(" and ")}); using existing local branch as-is.`,
    );
    return { status: "exists", localExists };
  }

  let remoteExists: boolean;
  try {
    remoteExists = remoteBranchExists(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    logger.warn(
      `Failed to reach origin to check whether '${normalized}' exists: ${diagnostic}. (If you expected a remote branch, double-check your network connection and branch name.)`,
    );
    return { status: "unknown", localExists };
  }

  if (!remoteExists) return { status: "missing", localExists };

  try {
    if (dryRun) {
      logger.step(`Would fetch origin/${normalized}`);
      return { status: "exists", localExists };
    }
    logger.step(`Fetching origin/${normalized} …`);
    fetchOriginBranch(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    throw new Error(
      `Failed to fetch origin/${normalized}: ${diagnostic}. Cannot proceed without a local branch.`,
    );
  }
  return { status: "exists", localExists };
}
