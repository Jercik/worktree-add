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
    const shouldContinue = await handleExistingDirectory(
      context.destinationDirectory,
      {
        dryRun,
        assumeYes,
        interactive,
        logger,
      },
    );
    if (!shouldContinue) {
      return;
    }

    const remoteStatus = (() => {
      try {
        return fetchRemoteBranch(context.branch, { dryRun, logger });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const prefix = `Failed to fetch origin/${context.branch}: `;
        const failure = message.startsWith(prefix)
          ? message
          : `${prefix}${message}`;
        exitWithMessage(
          `${failure}\n` +
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
    if (remoteStatus.status === "diverged") {
      const { ahead, behind } = remoteStatus.divergence;
      exitWithMessage(
        `Local branch '${context.branch}' and origin/${context.branch} have diverged (ahead by ${ahead} and behind by ${behind}).\n` +
          "This usually means a stale local branch is reusing a name now used by a different remote branch.\n" +
          "Refusing to reuse the local branch automatically.\n" +
          "To work on the remote branch, run:\n" +
          "  git fetch origin --prune\n" +
          `  git branch -m -- ${context.branch} ${context.branch}-old\n` +
          "  # or delete the stale local branch instead:\n" +
          `  # git branch -D -- ${context.branch}\n` +
          `  worktree-add ${context.branch}`,
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
