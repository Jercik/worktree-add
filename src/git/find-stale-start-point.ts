import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import {
  fetchOriginBranch,
  getAheadBehindCounts,
  getCurrentBranch,
  getRemoteBranchCommit,
  isAncestor,
  resolveCommit,
} from "./git.js";
import { extractDiagnosticLine } from "./extract-diagnostic-line.js";

export interface StaleStartPoint {
  /** The checked-out branch a new branch would start from. */
  readonly branch: string;
  /** Undefined when origin's commits are not available locally to count (dry run, unborn branch). */
  readonly counts: { readonly ahead: number; readonly behind: number } | undefined;
}

export function findStaleStartPoint(options?: {
  dryRun?: boolean;
  logger?: StatusLogger;
}): StaleStartPoint | undefined {
  const logger = options?.logger ?? fallbackStatusLogger;
  const dryRun = options?.dryRun ?? false;
  const branch = getCurrentBranch();
  if (branch === undefined) {
    logger.detail("HEAD is detached; not checking whether it is behind origin.");
    return undefined;
  }

  let remoteHead: string | undefined;
  try {
    remoteHead = getRemoteBranchCommit(branch);
  } catch (error) {
    const diagnostic = extractDiagnosticLine(error);
    throw new Error(
      `Failed to check whether '${branch}' is behind origin/${branch}: ${diagnostic}`,
      {
        cause: error,
      },
    );
  }
  const localHead = resolveCommit("HEAD");
  if (remoteHead === undefined || remoteHead === localHead) {
    return undefined;
  }
  if (localHead === undefined) {
    // An unborn branch has none of origin's commits.
    return { branch, counts: undefined };
  }

  if (resolveCommit(remoteHead) === undefined) {
    if (dryRun) {
      return { branch, counts: undefined };
    }
    logger.step(`Fetching origin/${branch} …`);
    try {
      fetchOriginBranch(branch);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      throw new Error(`Failed to fetch origin/${branch}: ${diagnostic}`, { cause: error });
    }
  }

  if (isAncestor(remoteHead, localHead)) {
    return undefined;
  }
  return { branch, counts: getAheadBehindCounts(localHead, remoteHead) };
}
