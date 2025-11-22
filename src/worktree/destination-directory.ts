/**
 * destination-directory.ts
 *
 * Utilities for managing worktree directories
 */

/**
 * Cross-platform trash functionality using the trash package.
 *
 * Platform-specific behavior:
 * - macOS: Uses Finder's trash (~/. Trash)
 * - Windows: Uses Recycle Bin
 * - Linux: Uses freedesktop.org trash specification (~/.local/share/Trash)
 *
 * Note: On headless/CI systems, the trash directory is still created but
 * may not be visible in a GUI. Files can be recovered by navigating to
 * the platform-specific trash location.
 */
import trash from "trash";
import path from "node:path";
import { fileExists, confirm, exitWithMessage } from "../git/git.js";

/**
 * Check if directory exists and prompt for removal if needed
 * Returns true if the directory should be created
 */
export async function handleExistingDirectory(
  destinationDirectory: string,
): Promise<void> {
  if (!(await fileExists(destinationDirectory))) {
    return;
  }

  const proceed = await confirm(
    `Directory '${path.basename(destinationDirectory)}' already exists. Move to trash and recreate? (You can restore it from your system trash if needed)`,
  );

  if (!proceed) {
    console.log("Operation cancelled.");
    // eslint-disable-next-line unicorn/no-process-exit -- User requested cancellation
    process.exit(0);
  }

  // Move the existing directory to trash
  console.log(`➤ Moving existing directory to trash...`);
  try {
    await trash(destinationDirectory);
    console.log("✓ Directory moved to trash successfully");
  } catch (error) {
    console.error("Error details:", error);
    exitWithMessage(
      `Failed to move existing directory to trash: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
