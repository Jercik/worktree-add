import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import { git, localBranchExists, normalizeBranchName, remoteBranchExists } from "./git.js";
import { extractDiagnosticLine } from "./extract-diagnostic-line.js";

const runGitWorktreeCommand = (
  args: string[],
  options: { dryRun: boolean; logger: StatusLogger },
): void => {
  options.logger.step(`${options.dryRun ? "Would run " : ""}git ${args.join(" ")}`);
  if (options.dryRun) {
    return;
  }
  git(...args);
};

export function createWorktree(
  branch: string,
  destinationDirectory: string,
  options?: {
    remoteBranchExists?: boolean;
    dryRun?: boolean;
    logger?: StatusLogger;
  },
): void {
  const logger = options?.logger ?? fallbackStatusLogger;
  const dryRun = options?.dryRun ?? false;
  const normalized = normalizeBranchName(branch);

  if (localBranchExists(normalized)) {
    runGitWorktreeCommand(
      ["worktree", "add", "--", destinationDirectory, `refs/heads/${normalized}`],
      {
        dryRun,
        logger,
      },
    );
    return;
  }

  let branchExistsOnOrigin = options?.remoteBranchExists;
  if (branchExistsOnOrigin === undefined) {
    try {
      branchExistsOnOrigin = remoteBranchExists(normalized);
    } catch (error) {
      const diagnostic = extractDiagnosticLine(error);
      throw new Error(
        `Failed to reach origin to check whether '${normalized}' exists: ${diagnostic}`,
        { cause: error },
      );
    }
  }

  if (branchExistsOnOrigin) {
    runGitWorktreeCommand(
      [
        "worktree",
        "add",
        "--track",
        "-b",
        normalized,
        "--",
        destinationDirectory,
        `origin/${normalized}`,
      ],
      { dryRun, logger },
    );
    return;
  }

  runGitWorktreeCommand(["worktree", "add", "-b", normalized, "--", destinationDirectory], {
    dryRun,
    logger,
  });
}
