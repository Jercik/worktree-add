import type { StatusLogger } from "../output/create-status-logger.js";
import { removeWorktree } from "../git/remove-worktree.js";

export function cleanupWorktree(
  destinationDirectory: string,
  logger: StatusLogger,
  reason: string,
): void {
  logger.warn(
    `Cleaning up worktree at ${JSON.stringify(destinationDirectory)} ${reason}.`,
  );
  try {
    removeWorktree(destinationDirectory);
  } catch (cleanupError) {
    const cleanupMessage =
      cleanupError instanceof Error
        ? cleanupError.message
        : String(cleanupError);
    logger.warn(
      `Failed to clean up worktree at ${JSON.stringify(destinationDirectory)}: ${cleanupMessage}`,
    );
  }
}
