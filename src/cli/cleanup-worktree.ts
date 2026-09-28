import type { StatusLogger } from "../output/create-status-logger.js";
import type { CreatedBranch, CreatedWorktree } from "../git/create-worktree.js";
import { deleteCreatedBranch } from "../git/delete-created-branch.js";
import { extractDiagnosticLine } from "../git/extract-diagnostic-line.js";
import { resolveCommit } from "../git/git.js";
import { removeWorktree } from "../git/remove-worktree.js";
import { findWorktreeByBranchName } from "../git/worktree-discovery.js";
import { planBranchCleanup } from "./plan-branch-cleanup.js";

function cleanupCreatedBranch(branch: CreatedBranch, logger: StatusLogger): void {
  try {
    const plan = planBranchCleanup({
      createdBranch: branch,
      currentCommit: resolveCommit(branch.ref),
      checkedOutAt: findWorktreeByBranchName(branch.name),
    });
    switch (plan.action) {
      case "delete": {
        deleteCreatedBranch(branch);
        logger.warn(`Deleted branch '${branch.name}', which this run created.`);
        break;
      }
      case "keep": {
        logger.warn(plan.message);
        break;
      }
      case "none": {
        break;
      }
    }
  } catch (error) {
    logger.warn(`Failed to delete branch '${branch.name}': ${extractDiagnosticLine(error)}`);
  }
}

export function cleanupWorktree(
  worktree: CreatedWorktree,
  logger: StatusLogger,
  reason: string,
): void {
  logger.warn(`Cleaning up worktree at ${JSON.stringify(worktree.directory)} ${reason}.`);
  try {
    removeWorktree(worktree.directory);
  } catch (cleanupError) {
    const cleanupMessage =
      cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
    logger.warn(
      `Failed to clean up worktree at ${JSON.stringify(worktree.directory)}: ${cleanupMessage}`,
    );
  }
  if (worktree.createdBranch !== undefined) {
    cleanupCreatedBranch(worktree.createdBranch, logger);
  }
}
