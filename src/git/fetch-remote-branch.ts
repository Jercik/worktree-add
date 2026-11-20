import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import {
  fetchOriginBranch,
  getAheadBehindCounts,
  getLocalBranchHead,
  getRemoteBranchHead,
  localBranchExists,
  normalizeBranchName,
  remoteBranchExists,
} from "./git.js";
import { classifyBranchDivergence } from "./classify-branch-divergence.js";
import { extractDiagnosticLine } from "./extract-diagnostic-line.js";
import type { BranchFastForward } from "./fast-forward-local-branch.js";

interface BranchDivergence {
  ahead: number;
  behind: number;
}
type FetchRemoteBranchResult =
  | {
      status: "diverged";
      localExists: true;
      divergence: BranchDivergence;
    }
  | {
      status: "exists";
      localExists: boolean;
      divergence: undefined;
      fastForward: BranchFastForward | undefined;
    }
  | {
      status: "missing" | "unknown";
      localExists: boolean;
      divergence: undefined;
    };

export function fetchRemoteBranch(
  branch: string,
  options?: { dryRun?: boolean; logger?: StatusLogger },
): FetchRemoteBranchResult {
  const logger = options?.logger ?? fallbackStatusLogger;
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
      return { status: "unknown", localExists, divergence: undefined };
    }

    if (!remoteExists) {
      return { status: "missing", localExists, divergence: undefined };
    }

    try {
      if (dryRun) {
        logger.step(`Would fetch origin/${normalized}`);
        logger.detail(
          `Dry run: local '${normalized}' may be fast-forwarded after fetch if it is behind origin/${normalized}.`,
        );
        logger.detail(
          "Dry run does not check local/remote divergence because it skips fetch; a real run may stop with a divergence error.",
        );
        return { status: "exists", localExists, divergence: undefined, fastForward: undefined };
      }
      logger.step(`Fetching origin/${normalized} …`);
      fetchOriginBranch(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      logger.warn(
        `Failed to fetch origin/${normalized}: ${diagnostic}. Using existing local branch (origin status unknown).`,
      );
      return { status: "unknown", localExists, divergence: undefined };
    }

    const localHead = getLocalBranchHead(normalized);
    const remoteHead = getRemoteBranchHead(normalized);
    if (!localHead || !remoteHead || localHead === remoteHead) {
      return { status: "exists", localExists, divergence: undefined, fastForward: undefined };
    }

    let counts: { ahead: number; behind: number };
    try {
      counts = getAheadBehindCounts(localHead, remoteHead);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      logger.warn(
        `Failed to compare local '${normalized}' with origin/${normalized}: ${diagnostic}. Using existing local branch as-is.`,
      );
      return { status: "exists", localExists, divergence: undefined, fastForward: undefined };
    }
    const { ahead, behind } = counts;
    const relation = classifyBranchDivergence(counts);

    if (relation === "behind") {
      return {
        status: "exists",
        localExists,
        divergence: undefined,
        fastForward: { branch: normalized, from: localHead, to: remoteHead },
      };
    }

    if (relation === "even") {
      // Defensive: rev-list should report differences when heads differ,
      // but shallow/corrupted refs can yield 0/0 counts.
      logger.warn(
        `Local branch '${normalized}' differs from origin/${normalized}, but Git reports no ahead/behind differences. Using existing local branch; if you encounter issues, try re-cloning the repository.`,
      );
      return { status: "exists", localExists, divergence: undefined, fastForward: undefined };
    }

    if (relation === "diverged") {
      return {
        status: "diverged",
        localExists,
        divergence: { ahead, behind },
      };
    }

    logger.warn(
      `Local branch '${normalized}' is ahead of origin/${normalized} (ahead by ${ahead}); using existing local branch as-is.`,
    );
    return { status: "exists", localExists, divergence: undefined, fastForward: undefined };
  }

  let remoteExists: boolean;
  try {
    remoteExists = remoteBranchExists(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    logger.warn(
      `Failed to reach origin to check whether '${normalized}' exists: ${diagnostic}. (If you expected a remote branch, double-check your network connection and branch name.)`,
    );
    return { status: "unknown", localExists, divergence: undefined };
  }

  if (!remoteExists) {
    return { status: "missing", localExists, divergence: undefined };
  }

  try {
    if (dryRun) {
      logger.step(`Would fetch origin/${normalized}`);
      return { status: "exists", localExists, divergence: undefined, fastForward: undefined };
    }
    logger.step(`Fetching origin/${normalized} …`);
    fetchOriginBranch(normalized);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    throw new Error(
      `Failed to fetch origin/${normalized}: ${diagnostic}. Cannot proceed without a local branch.`,
      { cause: error },
    );
  }
  return { status: "exists", localExists, divergence: undefined, fastForward: undefined };
}
