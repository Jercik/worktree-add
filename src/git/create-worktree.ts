import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import {
  git,
  localBranchExists,
  normalizeBranchName,
  remoteBranchExists,
  resolveCommit,
} from "./git.js";
import { extractDiagnosticLine } from "./extract-diagnostic-line.js";

export interface CreatedBranch {
  readonly name: string;
  readonly ref: string;
  readonly commit: string;
}

export interface CreatedWorktree {
  readonly directory: string;
  /** Undefined unless this run created the branch and it still sat at its start point. */
  readonly createdBranch: CreatedBranch | undefined;
}

interface WorktreeAddCommand {
  readonly args: string[];
  /** Where `-b` starts the new branch; undefined when an existing branch is reused. */
  readonly newBranchStartPoint: string | undefined;
}

function selectWorktreeAddCommand(
  normalized: string,
  destinationDirectory: string,
  remoteBranchExistsHint: boolean | undefined,
): WorktreeAddCommand {
  if (localBranchExists(normalized)) {
    return {
      args: ["worktree", "add", "--", destinationDirectory, `refs/heads/${normalized}`],
      newBranchStartPoint: undefined,
    };
  }

  let branchExistsOnOrigin = remoteBranchExistsHint;
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
    return {
      args: [
        "worktree",
        "add",
        "--track",
        "-b",
        normalized,
        "--",
        destinationDirectory,
        `origin/${normalized}`,
      ],
      newBranchStartPoint: `refs/remotes/origin/${normalized}`,
    };
  }

  return {
    args: ["worktree", "add", "-b", normalized, "--", destinationDirectory],
    newBranchStartPoint: "HEAD",
  };
}

/** Returns what was created, or undefined on a dry run. */
export function createWorktree(
  branch: string,
  destinationDirectory: string,
  options?: {
    remoteBranchExists?: boolean;
    dryRun?: boolean;
    logger?: StatusLogger;
  },
): CreatedWorktree | undefined {
  const logger = options?.logger ?? fallbackStatusLogger;
  const dryRun = options?.dryRun ?? false;
  const normalized = normalizeBranchName(branch);
  const command = selectWorktreeAddCommand(
    normalized,
    destinationDirectory,
    options?.remoteBranchExists,
  );

  logger.step(`${dryRun ? "Would run " : ""}git ${command.args.join(" ")}`);
  if (dryRun) {
    return undefined;
  }
  // Resolved before the add: a post-checkout hook can commit onto the new branch during it.
  const startCommit =
    command.newBranchStartPoint === undefined
      ? undefined
      : resolveCommit(command.newBranchStartPoint);
  git(...command.args);

  const ref = `refs/heads/${normalized}`;
  return {
    directory: destinationDirectory,
    createdBranch:
      startCommit !== undefined && resolveCommit(ref) === startCommit
        ? { name: normalized, ref, commit: startCommit }
        : undefined,
  };
}
