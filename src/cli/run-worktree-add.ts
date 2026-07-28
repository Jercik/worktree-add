import { createStatusLogger } from "../output/create-status-logger.js";
import { resolveApps } from "../app/resolve-apps.js";
import { handleExistingDirectory } from "../worktree/destination-directory.js";
import { copyLocalFiles } from "../worktree/copy-local-files.js";
import { parseCopyFileNames } from "../worktree/local-file-paths.js";
import {
  closePreflightedLocalFiles,
  preflightLocalFiles,
} from "../worktree/preflight-local-files.js";
import { setupProject } from "../project/setup.js";
import { exitWithMessage } from "../git/git.js";
import { createWorktree } from "../git/create-worktree.js";
import { fetchRemoteBranch } from "../git/fetch-remote-branch.js";
import { abortLocalFileCopy } from "./abort-local-file-copy.js";
import { cleanupWorktree } from "./cleanup-worktree.js";
import { formatDivergedBranchMessage } from "./format-diverged-branch-message.js";
import { handleWorktreeAddFailure } from "./handle-worktree-add-failure.js";
import { openWorktreeApps } from "./open-worktree-apps.js";
import { registerSigintHandler } from "./register-sigint-handler.js";
import { resolveWorktreeContext } from "./resolve-worktree-context.js";

export interface CliOptions {
  readonly app?: string[];
  readonly copyFile?: string[];
  readonly offline?: boolean;
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
  const copyFiles = parseCopyFileNames(options.copyFile ?? []);

  const context = resolveWorktreeContext(branchRaw);
  const localFiles = await preflightLocalFiles(context.repoRoot, copyFiles, { logger });
  let worktreeCreated = false;
  let setupCompleted = false;
  let copyAbortController: AbortController | undefined;
  let copying: Promise<void> | undefined;
  let sigintCleanupStarted = false;
  let destinationMayBeIncomplete = false;
  let worktreeCleanupAttempted = false;
  const cleanupIfNeeded = (reason: string): boolean => {
    if (!worktreeCreated || dryRun || worktreeCleanupAttempted) {
      return false;
    }
    worktreeCleanupAttempted = true;
    cleanupWorktree(context.destinationDirectory, logger, reason);
    return true;
  };
  let unregisterSigintHandler: (() => void) | undefined;

  try {
    unregisterSigintHandler = registerSigintHandler({
      destinationDirectory: context.destinationDirectory,
      logger,
      onCleanup: async () => {
        sigintCleanupStarted = true;
        if (!setupCompleted) {
          if (cleanupIfNeeded("after interruption")) {
            return "removed";
          }
          return destinationMayBeIncomplete ? "destination-may-be-incomplete" : "none";
        }
        await abortLocalFileCopy(copyAbortController, copying, logger);
        return worktreeCreated ? "kept" : "none";
      },
    });
    const existingDirectory = await handleExistingDirectory(context.destinationDirectory, {
      dryRun,
      assumeYes,
      interactive,
      logger,
      onMutationPhase: (phase) => {
        destinationMayBeIncomplete = phase === "started";
      },
    });
    if (!existingDirectory.shouldContinue) {
      return;
    }

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

    await setupProject(context.destinationDirectory, { dryRun, logger });
    setupCompleted = true;

    copyAbortController = new AbortController();
    copying = copyLocalFiles(context.destinationDirectory, localFiles, {
      dryRun,
      assumeDestinationEmpty: existingDirectory.assumeDestinationEmpty,
      logger,
      signal: copyAbortController.signal,
    });
    try {
      await copying;
    } finally {
      copying = undefined;
      copyAbortController = undefined;
    }

    const apps = resolveApps({
      optionApps: options.app,
      environmentApps: process.env.WORKTREE_ADD_APP,
    });

    await openWorktreeApps(context.destinationDirectory, apps, {
      dryRun,
      logger,
    });
  } catch (error) {
    handleWorktreeAddFailure(error, {
      cleanupIfNeeded,
      destinationDirectory: context.destinationDirectory,
      setupCompleted,
      sigintCleanupStarted,
      worktreeCreated,
    });
  } finally {
    try {
      await closePreflightedLocalFiles(localFiles, logger);
    } finally {
      unregisterSigintHandler?.();
    }
  }
}
