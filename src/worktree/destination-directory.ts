import path from "node:path";
import trash from "trash";
import { fileExists, confirm, exitWithMessage, git } from "../git/git.js";
import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";

interface HandleExistingDirectoryOptions {
  readonly dryRun?: boolean;
  readonly assumeYes?: boolean;
  readonly interactive?: boolean;
  readonly logger?: StatusLogger;
}

type PromptRefusal =
  | { readonly type: "ci-interactive-without-tty" }
  | { readonly type: "non-interactive"; readonly ciHint: string }
  | { readonly type: "stdin-not-tty" };

interface PromptState {
  readonly interactive: boolean;
  readonly isCi: boolean;
  readonly isTty: boolean | undefined;
}

function getPromptRefusal({ interactive, isCi, isTty }: PromptState): PromptRefusal | undefined {
  if (isCi && interactive && !isTty) {
    return { type: "ci-interactive-without-tty" };
  }

  if (!interactive) {
    return { type: "non-interactive", ciHint: isCi ? " (CI is enabled)" : "" };
  }

  if (!isTty) {
    return { type: "stdin-not-tty" };
  }

  return undefined;
}

function promptRefusalLines(directoryName: string, refusal: PromptRefusal): string[] {
  switch (refusal.type) {
    case "ci-interactive-without-tty": {
      return [
        `Directory '${directoryName}' already exists, and CI mode is enabled.`,
        "Interactive prompts are disabled in CI.",
        "Re-run with --yes to move the directory to trash, or remove it manually.",
      ];
    }
    case "non-interactive": {
      return [
        `Directory '${directoryName}' already exists${refusal.ciHint}.`,
        "Refusing to prompt in non-interactive mode.",
        "Re-run with --interactive to confirm, or --yes to move it to trash.",
      ];
    }
    case "stdin-not-tty": {
      return [
        `Directory '${directoryName}' already exists, but stdin is not a TTY.`,
        "Re-run with --yes to move it to trash, or remove it manually.",
      ];
    }
    default: {
      const exhaustive: never = refusal;
      return exhaustive;
    }
  }
}

function formatPromptRefusal(directoryName: string, refusal: PromptRefusal): string {
  return promptRefusalLines(directoryName, refusal).join("\n");
}

function formatDryRunPromptRefusal(directoryName: string, refusal: PromptRefusal): string {
  // Dry run collapses the refusal onto one prefixed line, so lowercase the leading word.
  const inlined = promptRefusalLines(directoryName, refusal).join(" ");
  return `Dry run: ${inlined.charAt(0).toLowerCase()}${inlined.slice(1)}`;
}

export async function handleExistingDirectory(
  destinationDirectory: string,
  options: HandleExistingDirectoryOptions = {},
): Promise<boolean> {
  if (!(await fileExists(destinationDirectory))) {
    return true;
  }

  const logger = options.logger ?? fallbackStatusLogger;
  const dryRun = options.dryRun ?? false;
  const assumeYes = options.assumeYes ?? false;
  const interactive = options.interactive ?? false;
  const isTty = process.stdin.isTTY;
  const ciValue = process.env.CI?.toLowerCase();
  const isCi = ciValue === "true" || ciValue === "1";
  const directoryName = path.basename(destinationDirectory);
  const promptRefusal = assumeYes ? undefined : getPromptRefusal({ interactive, isCi, isTty });

  if (dryRun) {
    if (promptRefusal !== undefined) {
      logger.warn(formatDryRunPromptRefusal(directoryName, promptRefusal));
      return false;
    }

    if (!assumeYes) {
      logger.step(`Would prompt to move existing directory '${directoryName}' to trash`);
      return false;
    }

    logger.step(`Would move existing directory '${directoryName}' to trash`);
    return true;
  }

  if (promptRefusal !== undefined) {
    exitWithMessage(formatPromptRefusal(directoryName, promptRefusal));
  }

  if (!assumeYes) {
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
      if (!line.startsWith("worktree ")) {
        continue;
      }
      const worktreePath = line.replace(/^worktree\s+/u, "").trim();
      if (path.resolve(worktreePath) === resolvedDestination) {
        shouldPruneWorktree = true;
        break;
      }
    }
  } catch (error) {
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.detail(`Error checking for existing worktree registration: ${details}`);
  }

  logger.step(`Moving existing directory '${directoryName}' to trash...`);
  try {
    await trash(destinationDirectory);
    logger.success("Directory moved to trash successfully");
  } catch (error) {
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
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
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.detail(`Error details: ${details}`);
    exitWithMessage(
      `Failed to prune stale worktree registration for '${directoryName}'. Run 'git worktree prune' and retry.`,
    );
  }

  return true;
}
