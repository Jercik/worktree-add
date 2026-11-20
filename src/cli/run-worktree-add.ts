import { createStatusLogger } from "../output/create-status-logger.js";
import { resolveOpenTarget } from "../app/resolve-open-target.js";
import { handleExistingDirectory } from "../worktree/destination-directory.js";
import { copyUntrackedFiles } from "../worktree/untracked-file-copy.js";
import { setupProject } from "../project/setup.js";
import { createWorktree } from "../git/create-worktree.js";
import type { CreatedWorktree } from "../git/create-worktree.js";
import { cleanupWorktree } from "./cleanup-worktree.js";
import { openWorktreeApps } from "./open-worktree-apps.js";
import { registerSigintHandler } from "./register-sigint-handler.js";
import { resolveBranchSource } from "./resolve-branch-source.js";
import { resolveWorktreeContext } from "./resolve-worktree-context.js";

export interface CliOptions {
  readonly app?: string[];
  readonly open?: boolean;
  readonly offline?: boolean;
  readonly allowStale?: boolean;
  readonly copy?: boolean;
  readonly setup?: boolean;
  readonly yes?: boolean;
  readonly interactive?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
}

export async function runWorktreeAdd(branchRaw: string, options: CliOptions): Promise<void> {
  const dryRun = options.dryRun ?? false;
  const verbose = options.verbose ?? false;
  const logger = createStatusLogger({
    dryRun,
    verbose,
    decorate: process.stderr.isTTY && !Object.hasOwn(process.env, "NO_COLOR"),
  });
  const interactive = options.interactive ?? false;
  const assumeYes = options.yes ?? false;

  const context = resolveWorktreeContext(branchRaw);
  let createdWorktree: CreatedWorktree | undefined;
  const cleanupIfNeeded = (reason: string): void => {
    if (createdWorktree === undefined) {
      return;
    }
    cleanupWorktree(createdWorktree, logger, reason);
  };
  const unregisterSigintHandler = registerSigintHandler({
    destinationDirectory: context.destinationDirectory,
    logger,
    onCleanup: () => {
      cleanupIfNeeded("after interruption");
    },
  });

  try {
    // Every check against origin runs before clearing the destination: nothing restores it from the trash.
    const source = resolveBranchSource(context.branch, {
      offline: options.offline ?? false,
      allowStale: options.allowStale ?? false,
      dryRun,
      logger,
    });
    if (
      !(await handleExistingDirectory(context.destinationDirectory, {
        dryRun,
        assumeYes,
        interactive,
        logger,
      }))
    ) {
      return;
    }
    await createWorktree(context.branch, context.destinationDirectory, {
      sourceRoot: context.repoRoot,
      onCreated(worktree) {
        createdWorktree = worktree;
      },
      source,
      dryRun,
      logger,
    });

    if (options.copy !== false) {
      await copyUntrackedFiles(context.repoRoot, context.destinationDirectory, {
        dryRun,
        logger,
      });
    } else if (dryRun) {
      logger.step("Would skip copying untracked and ignored local files (--no-copy).");
    } else {
      console.error("Skipping copying untracked and ignored local files (--no-copy).");
    }

    if (options.setup !== false) {
      await setupProject(context.destinationDirectory, { dryRun, logger });
    } else if (dryRun) {
      logger.step(
        "Would skip project setup (--no-setup): dependency installation and Next.js type generation.",
      );
    } else {
      console.error(
        "Skipping project setup (--no-setup): dependency installation and Next.js type generation.",
      );
    }

    const target = resolveOpenTarget({
      optionApps: options.app,
      environmentApps: process.env.WORKTREE_ADD_APP,
      open: options.open ?? false,
    });

    await openWorktreeApps(context.destinationDirectory, target, {
      dryRun,
      logger,
    });
  } catch (error) {
    cleanupIfNeeded("due to failure");
    throw error;
  } finally {
    unregisterSigintHandler();
  }
}
