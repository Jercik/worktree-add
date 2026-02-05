import { createStatusLogger } from "../output/create-status-logger.js";
import { resolveApps } from "../app/resolve-apps.js";
import { handleExistingDirectory } from "../worktree/destination-directory.js";
import { copyUntrackedFiles } from "../worktree/untracked-file-copy.js";
import { setupProject } from "../project/setup.js";
import { exitWithMessage } from "../git/git.js";
import { createWorktree } from "../git/create-worktree.js";
import { fetchRemoteBranch } from "../git/fetch-remote-branch.js";
import { cleanupWorktree } from "./cleanup-worktree.js";
import { openWorktreeApps } from "./open-worktree-apps.js";
import { registerSigintHandler } from "./register-sigint-handler.js";
import { resolveWorktreeContext } from "./resolve-worktree-context.js";

export type CliOptions = {
  readonly app?: string[];
  readonly offline?: boolean;
  readonly yes?: boolean;
  readonly interactive?: boolean;
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
};

export async function runWorktreeAdd(
  branchRaw: string,
  options: CliOptions,
): Promise<void> {
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
  let worktreeCreated = false;
  const cleanupIfNeeded = (reason: string): void => {
    if (!worktreeCreated || dryRun) return;
    cleanupWorktree(context.destinationDirectory, logger, reason);
  };
  const unregisterSigintHandler = registerSigintHandler({
    destinationDirectory: context.destinationDirectory,
    logger,
    onCleanup: () => {
      cleanupIfNeeded("after interruption");
    },
  });

  try {
    await handleExistingDirectory(context.destinationDirectory, {
      dryRun,
      assumeYes,
      interactive,
      logger,
    });

    const remoteStatus = (() => {
      try {
        return fetchRemoteBranch(context.branch, { dryRun, logger });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        exitWithMessage(
          `Failed to fetch origin/${context.branch}: ${message}\n` +
            "If you expected this to work, check your network/credentials and retry.\n" +
            "If you want a new local branch from HEAD instead, pass --offline.",
        );
      }
    })();
    if (
      remoteStatus.status === "unknown" &&
      !remoteStatus.localExists &&
      !options.offline
    ) {
      exitWithMessage(
        `Could not reach origin to check whether '${context.branch}' exists, and the branch does not exist locally.\n` +
          "Refusing to create a new branch from HEAD in this ambiguous state.\n" +
          `Re-run with --offline to force creating a new local '${context.branch}' from the current HEAD.`,
      );
    }

    // Only treat origin as existing when confirmed; "unknown" remains false.
    const remoteBranchExists = remoteStatus.status === "exists";
    createWorktree(context.branch, context.destinationDirectory, {
      remoteBranchExists,
      dryRun,
      logger,
    });
    if (!dryRun) {
      worktreeCreated = true;
    }

    await copyUntrackedFiles(context.repoRoot, context.destinationDirectory, {
      dryRun,
      logger,
    });

    await setupProject(context.destinationDirectory, { dryRun, logger });

    const apps = resolveApps({
      optionApps: options.app,
      environmentApps: process.env.WORKTREE_ADD_APP,
    });

    await openWorktreeApps(context.destinationDirectory, apps, {
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
