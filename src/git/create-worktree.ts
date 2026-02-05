import type { StatusLogger } from "../output/create-status-logger.js";
import { getStatusLogger } from "../output/get-status-logger.js";
import {
  git,
  localBranchExists,
  normalizeBranchName,
  remoteBranchExists,
} from "./git.js";
import { extractDiagnosticLine } from "./extract-diagnostic-line.js";

/**
 * Create a worktree for the given branch at the specified destination.
 */
export function createWorktree(
  branch: string,
  destinationDirectory: string,
  options?: {
    remoteBranchExists?: boolean;
    dryRun?: boolean;
    logger?: StatusLogger;
  },
): void {
  const logger = getStatusLogger(options?.logger);
  const dryRun = options?.dryRun ?? false;
  const normalized = normalizeBranchName(branch);

  if (localBranchExists(normalized)) {
    logger.step(
      `${dryRun ? "Would run " : ""}git worktree add -- ${destinationDirectory} refs/heads/${normalized}`,
    );
    if (dryRun) return;
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
    logger.step(
      `${dryRun ? "Would run " : ""}git worktree add --track -b ${normalized} -- ${destinationDirectory} origin/${normalized}`,
    );
    if (dryRun) return;
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

  logger.step(
    `${dryRun ? "Would run " : ""}git worktree add -b ${normalized} -- ${destinationDirectory}`,
  );
  if (dryRun) return;
  git("worktree", "add", "-b", normalized, "--", destinationDirectory);
}
