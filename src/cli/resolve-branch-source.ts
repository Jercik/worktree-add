import type { StatusLogger } from "../output/create-status-logger.js";
import type { BranchSource } from "../git/create-worktree.js";
import type { BranchFastForward } from "../git/fast-forward-local-branch.js";
import { classifyBranchDivergence } from "../git/classify-branch-divergence.js";
import { extractDiagnosticLine } from "../git/extract-diagnostic-line.js";
import { findStaleStartPoint } from "../git/find-stale-start-point.js";
import {
  fetchOriginBranch,
  getAheadBehindCounts,
  getLocalBranchHead,
  getRemoteBranchHead,
  localBranchExists,
  normalizeBranchName,
  remoteBranchExists,
} from "../git/git.js";
import {
  findUnbornHeadGitBlocker,
  formatUnbornHeadGitMessage,
} from "../git/unborn-head-support.js";
import { formatDivergedBranchMessage } from "./format-diverged-branch-message.js";
import { formatStaleStartPointMessage } from "./format-stale-start-point-message.js";

interface ResolveBranchSourceOptions {
  readonly offline: boolean;
  readonly allowStale: boolean;
  readonly dryRun: boolean;
  readonly logger: StatusLogger;
}

export function resolveBranchSource(
  branch: string,
  options: ResolveBranchSourceOptions,
): BranchSource {
  const normalized = normalizeBranchName(branch);
  if (localBranchExists(normalized)) {
    const fastForward = fetchAndCompareWithOrigin(normalized, options);
    return { kind: "local", branch: normalized, fastForward };
  }
  return resolveNewBranchSource(normalized, options);
}

function fetchAndCompareWithOrigin(
  branch: string,
  { dryRun, logger }: ResolveBranchSourceOptions,
): BranchFastForward | undefined {
  let remoteExists: boolean;
  try {
    remoteExists = remoteBranchExists(branch);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    logger.warn(
      `Failed to query origin for '${branch}': ${diagnostic}. Using existing local branch. (If you expected a remote branch, double-check your network connection and branch name.)`,
    );
    return undefined;
  }
  if (!remoteExists) {
    return undefined;
  }

  if (dryRun) {
    logger.step(`Would fetch origin/${branch}`);
    logger.detail(
      `Dry run: local '${branch}' may be fast-forwarded after fetch if it is behind origin/${branch}.`,
    );
    logger.detail(
      "Dry run does not check local/remote divergence because it skips fetch; a real run may stop with a divergence error.",
    );
    return undefined;
  }
  try {
    logger.step(`Fetching origin/${branch} …`);
    fetchOriginBranch(branch);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    logger.warn(
      `Failed to fetch origin/${branch}: ${diagnostic}. Using existing local branch (origin status unknown).`,
    );
    return undefined;
  }

  const localHead = getLocalBranchHead(branch);
  const remoteHead = getRemoteBranchHead(branch);
  if (!localHead || !remoteHead || localHead === remoteHead) {
    return undefined;
  }

  let counts: { ahead: number; behind: number };
  try {
    counts = getAheadBehindCounts(localHead, remoteHead);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    logger.warn(
      `Failed to compare local '${branch}' with origin/${branch}: ${diagnostic}. Using existing local branch as-is.`,
    );
    return undefined;
  }

  const relation = classifyBranchDivergence(counts);
  switch (relation) {
    case "behind": {
      return { from: localHead, to: remoteHead };
    }
    case "even": {
      // Defensive: rev-list should report differences when heads differ,
      // but shallow/corrupted refs can yield 0/0 counts.
      logger.warn(
        `Local branch '${branch}' differs from origin/${branch}, but Git reports no ahead/behind differences. Using existing local branch; if you encounter issues, try re-cloning the repository.`,
      );
      return undefined;
    }
    case "diverged": {
      throw new Error(formatDivergedBranchMessage({ branch, ...counts }));
    }
    case "ahead": {
      logger.warn(
        `Local branch '${branch}' is ahead of origin/${branch} (ahead by ${counts.ahead}); using existing local branch as-is.`,
      );
      return undefined;
    }
    default: {
      const exhaustive: never = relation;
      return exhaustive;
    }
  }
}

function resolveNewBranchSource(branch: string, options: ResolveBranchSourceOptions): BranchSource {
  const { dryRun, logger } = options;
  let remoteExists: boolean;
  try {
    remoteExists = remoteBranchExists(branch);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    logger.warn(
      `Failed to reach origin to check whether '${branch}' exists: ${diagnostic}. (If you expected a remote branch, double-check your network connection and branch name.)`,
    );
    if (!options.offline) {
      throw new Error(
        `Could not reach origin to check whether '${branch}' exists, and the branch does not exist locally.\n` +
          "Refusing to create a new branch from HEAD in this ambiguous state.\n" +
          `Re-run with --offline to force creating a new local '${branch}' from the current HEAD.`,
        { cause: error },
      );
    }
    assertHeadCanStartBranch();
    return { kind: "head", branch };
  }

  if (!remoteExists) {
    assertHeadCanStartBranch();
    if (!options.allowStale) {
      const staleStartPoint = findStaleStartPoint({ dryRun, logger });
      if (staleStartPoint !== undefined) {
        throw new Error(formatStaleStartPointMessage(branch, staleStartPoint));
      }
    }
    return { kind: "head", branch };
  }

  if (dryRun) {
    logger.step(`Would fetch origin/${branch}`);
    return { kind: "origin", branch };
  }
  try {
    logger.step(`Fetching origin/${branch} …`);
    fetchOriginBranch(branch);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    throw new Error(
      `Failed to fetch origin/${branch}: ${diagnostic}. Cannot proceed without a local branch.\n` +
        "If you expected this to work, check your network/credentials and retry.\n" +
        "If you want a new local branch from HEAD instead, pass --offline.",
      { cause: error },
    );
  }
  return { kind: "origin", branch };
}

function assertHeadCanStartBranch(): void {
  const oldGitVersion = findUnbornHeadGitBlocker();
  if (oldGitVersion !== undefined) {
    throw new Error(formatUnbornHeadGitMessage(oldGitVersion));
  }
}
