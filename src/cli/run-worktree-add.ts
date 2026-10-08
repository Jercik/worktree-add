import { createStatusLogger } from "../output/create-status-logger.js";
import { resolveOpenTarget } from "../app/resolve-open-target.js";
import { handleExistingDirectory } from "../worktree/destination-directory.js";
import { copyUntrackedFiles } from "../worktree/untracked-file-copy.js";
import { setupProject } from "../project/setup.js";
import { exitWithMessage, localBranchExists } from "../git/git.js";
import { createWorktree } from "../git/create-worktree.js";
import type { CreatedWorktree } from "../git/create-worktree.js";
import { fetchRemoteBranch } from "../git/fetch-remote-branch.js";
import { findStaleStartPoint } from "../git/find-stale-start-point.js";
import { cleanupWorktree } from "./cleanup-worktree.js";
import { formatDivergedBranchMessage } from "./format-diverged-branch-message.js";
import { formatStaleStartPointMessage } from "./format-stale-start-point-message.js";
import { openWorktreeApps } from "./open-worktree-apps.js";
import { registerSigintHandler } from "./register-sigint-handler.js";
import { resolveWorktreeContext } from "./resolve-worktree-context.js";

export interface CliOptions {
  readonly app?: string[];
  readonly open?: boolean;
  readonly offline?: boolean;
  readonly allowStale?: boolean;
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
    const clearDestination = (): Promise<boolean> =>
      handleExistingDirectory(context.destinationDirectory, {
        dryRun,
        assumeYes,
        interactive,
        logger,
      });
    const resolveRemoteStatus = (): ReturnType<typeof fetchRemoteBranch> => {
      const remoteStatus = (() => {
        try {
          return fetchRemoteBranch(context.branch, { dryRun, logger });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const prefix = `Failed to fetch origin/${context.branch}: `;
          const failure = message.startsWith(prefix) ? message : `${prefix}${message}`;
          return exitWithMessage(
            `${failure}\n` +
              "If you expected this to work, check your network/credentials and retry.\n" +
              "If you want a new local branch from HEAD instead, pass --offline.",
          );
        }
      })();
      if (remoteStatus.status === "unknown" && !remoteStatus.localExists && !options.offline) {
        exitWithMessage(
          `Could not reach origin to check whether '${context.branch}' exists, and the branch does not exist locally.\n` +
            "Refusing to create a new branch from HEAD in this ambiguous state.\n" +
            `Re-run with --offline to force creating a new local '${context.branch}' from the current HEAD.`,
        );
      }
      if (remoteStatus.status === "diverged") {
        const { ahead, behind } = remoteStatus.divergence;
        exitWithMessage(
          formatDivergedBranchMessage({
            branch: context.branch,
            ahead,
            behind,
          }),
        );
      }

      // Only a new branch starts from HEAD. With origin unreachable (--offline) there is nothing to compare.
      if (remoteStatus.status === "missing" && !remoteStatus.localExists && !options.allowStale) {
        const staleStartPoint = findStaleStartPoint({ dryRun, logger });
        if (staleStartPoint !== undefined) {
          throw new Error(formatStaleStartPointMessage(context.branch, staleStartPoint));
        }
      }
      return remoteStatus;
    };

    let remoteStatus: ReturnType<typeof fetchRemoteBranch>;
    if (localBranchExists(context.branch)) {
      // The destination being replaced may have this branch checked out, which blocks fast-forwarding it.
      if (!(await clearDestination())) {
        return;
      }
      remoteStatus = resolveRemoteStatus();
    } else {
      // A refusal must leave an existing destination in place: nothing restores it from the trash.
      remoteStatus = resolveRemoteStatus();
      if (!(await clearDestination())) {
        return;
      }
    }

    // Only treat origin as existing when confirmed; "unknown" remains false.
    const remoteBranchExists = remoteStatus.status === "exists";
    createdWorktree = createWorktree(context.branch, context.destinationDirectory, {
      remoteBranchExists,
      dryRun,
      logger,
    });

    await copyUntrackedFiles(context.repoRoot, context.destinationDirectory, {
      dryRun,
      logger,
    });

    await setupProject(context.destinationDirectory, { dryRun, logger });

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
