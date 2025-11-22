/**
 * destination-directory.ts
 *
 * Utilities for managing worktree directories
 */

import { spawnSync } from "node:child_process";
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
    `Directory '${path.basename(destinationDirectory)}' already exists. Remove and recreate?`,
  );

  if (!proceed) {
    console.log("Operation cancelled.");
    // eslint-disable-next-line unicorn/no-process-exit -- User requested cancellation
    process.exit(0);
  }

  // Remove the existing directory
  console.log(`➤ Removing existing directory...`);
  const result = spawnSync("rm", ["-rf", destinationDirectory], {
    encoding: "utf8",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    exitWithMessage(`Failed to remove existing directory: ${result.stderr}`);
  }
}
