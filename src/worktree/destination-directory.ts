/**
 * destination-directory.ts
 *
 * Utilities for managing worktree directories
 */

/**
 * Cross-platform trash functionality using the trash package.
 *
 * Platform-specific behavior:
 * - macOS: Uses Finder's trash (~/.Trash)
 * - Windows: Uses Recycle Bin
 * - Linux: Uses freedesktop.org trash specification (~/.local/share/Trash)
 *
 * Note: On headless/CI systems, the trash directory is still created but
 * may not be visible in a GUI. Files can be recovered by navigating to
 * the platform-specific trash location.
 */
import path from "node:path";
import trash from "trash";
import { fileExists, confirm, exitWithMessage, git } from "../git/git.js";
import type { StatusLogger } from "../output/create-status-logger.js";
import { getStatusLogger } from "../output/get-status-logger.js";

/**
 * Check if directory exists and handle removal if needed.
 */
type HandleExistingDirectoryOptions = {
  readonly dryRun?: boolean;
  readonly assumeYes?: boolean;
  readonly interactive?: boolean;
  readonly logger?: StatusLogger;
};

export async function handleExistingDirectory(
  destinationDirectory: string,
  options: HandleExistingDirectoryOptions = {},
): Promise<boolean> {
  if (!(await fileExists(destinationDirectory))) {
    return true;
  }

  const logger = getStatusLogger(options.logger);
  const dryRun = options.dryRun ?? false;
  const assumeYes = options.assumeYes ?? false;
  const interactive = options.interactive ?? false;
  const isTty = process.stdin.isTTY;
  const ciValue = process.env.CI?.toLowerCase();
  const isCi = ciValue === "true" || ciValue === "1";
  const directoryName = path.basename(destinationDirectory);

  if (dryRun) {
    if (!assumeYes) {
      // Explicit --interactive in CI without a TTY can't prompt; call it out.
      if (isCi && interactive && !isTty) {
        logger.warn(
          `Dry run: directory '${directoryName}' already exists, and CI mode is enabled. Interactive prompts are disabled in CI. Re-run with --yes to move the directory to trash, or remove it manually.`,
        );
        return false;
      }

      if (!interactive) {
        const ciHint = isCi ? " (CI is enabled)" : "";
        logger.warn(
          `Dry run: directory '${directoryName}' already exists${ciHint}. Refusing to prompt in non-interactive mode. Re-run with --interactive to confirm, or --yes to move it to trash.`,
        );
        return false;
      }

      if (!isTty) {
        logger.warn(
          `Dry run: directory '${directoryName}' already exists, but stdin is not a TTY. Re-run with --yes to move it to trash, or remove it manually.`,
        );
        return false;
      }

      logger.step(
        `Would prompt to move existing directory '${directoryName}' to trash`,
      );
      return false;
    }

    logger.step(`Would move existing directory '${directoryName}' to trash`);
    return true;
  }

  if (!assumeYes) {
    // Explicit --interactive in CI without a TTY can't prompt; call it out.
    if (isCi && interactive && !isTty) {
      exitWithMessage(
        `Directory '${directoryName}' already exists, and CI mode is enabled.\n` +
          "Interactive prompts are disabled in CI.\n" +
          "Re-run with --yes to move the directory to trash, or remove it manually.",
      );
    }

    if (!interactive) {
      const ciHint = isCi ? " (CI is enabled)" : "";
      exitWithMessage(
        `Directory '${directoryName}' already exists${ciHint}.\n` +
          "Refusing to prompt in non-interactive mode.\n" +
          "Re-run with --interactive to confirm, or --yes to move it to trash.",
      );
    }

    if (!isTty) {
      exitWithMessage(
        `Directory '${directoryName}' already exists, but stdin is not a TTY.\n` +
          "Re-run with --yes to move it to trash, or remove it manually.",
      );
    }

    const proceed = await confirm(
      `Directory '${directoryName}' already exists. Move to trash and recreate? (You can restore it from your system trash if needed)`,
    );

    if (!proceed) {
      console.error("Operation cancelled.");
      // eslint-disable-next-line unicorn/no-process-exit -- User requested cancellation
      process.exit(0);
    }
  }

  const resolvedDestination = path.resolve(destinationDirectory);
  let shouldPruneWorktree = false;
  try {
    const worktreeList = git("worktree", "list", "--porcelain");
    const lines = worktreeList.split(/\n/u);
    for (const line of lines) {
      if (!line.startsWith("worktree ")) continue;
      const worktreePath = line.replace(/^worktree\s+/u, "").trim();
      if (path.resolve(worktreePath) === resolvedDestination) {
        shouldPruneWorktree = true;
        break;
      }
    }
  } catch (error) {
    const details =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.detail(
      `Error checking for existing worktree registration: ${details}`,
    );
  }

  // Move the existing directory to trash
  logger.step(`Moving existing directory '${directoryName}' to trash...`);
  try {
    await trash(destinationDirectory);
    logger.success("Directory moved to trash successfully");
  } catch (error) {
    const details =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.detail(`Error details: ${details}`);
    exitWithMessage(
      `Failed to move existing directory to trash: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!shouldPruneWorktree) {
    return true;
  }

  logger.detail(`Pruning stale worktree registration for '${directoryName}'.`);
  try {
    git("worktree", "prune");
  } catch (error) {
    const details =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.detail(`Error details: ${details}`);
    exitWithMessage(
      `Failed to prune stale worktree registration for '${directoryName}'. Run 'git worktree prune' and retry.`,
    );
  }

  return true;
}
