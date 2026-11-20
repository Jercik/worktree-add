import { canSeedCheckout, checkoutTrackedFiles } from "./checkout-tracked-files.js";
import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import { git, normalizeBranchName, readBranchConfig, resolveCommit } from "./git.js";
import type { BranchFastForward } from "./fast-forward-local-branch.js";
import { fastForwardLocalBranch } from "./fast-forward-local-branch.js";
import type { BranchConfig } from "./parse-branch-config.js";

export type BranchSource =
  | { readonly kind: "local"; readonly fastForward: BranchFastForward | undefined }
  | { readonly kind: "origin" }
  | { readonly kind: "head" };

export interface CreatedBranch {
  readonly name: string;
  readonly ref: string;
  readonly commit: string;
  /** `git worktree add -b` keeps `branch.<name>.*` config that predates the branch. */
  readonly preexistingConfig: BranchConfig;
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
  source: BranchSource,
): WorktreeAddCommand {
  switch (source.kind) {
    case "local": {
      // The bare name checks the branch out; a full `refs/heads/` ref would detach HEAD.
      return {
        args: ["worktree", "add", "--", destinationDirectory, normalized],
        newBranchStartPoint: undefined,
      };
    }
    case "origin": {
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
    case "head": {
      return {
        args: ["worktree", "add", "-b", normalized, "--", destinationDirectory],
        newBranchStartPoint: "HEAD",
      };
    }
    default: {
      const exhaustive: never = source;
      return exhaustive;
    }
  }
}

export async function createWorktree(
  branch: string,
  destinationDirectory: string,
  options: {
    sourceRoot: string;
    onCreated: (worktree: CreatedWorktree) => void;
    source: BranchSource;
    dryRun?: boolean;
    logger?: StatusLogger;
  },
): Promise<void> {
  const logger = options.logger ?? fallbackStatusLogger;
  const dryRun = options.dryRun ?? false;
  const normalized = normalizeBranchName(branch);
  const command = selectWorktreeAddCommand(normalized, destinationDirectory, options.source);

  if (dryRun) {
    logger.step(`Would run git ${command.args.join(" ")}`);
    return;
  }
  if (options.source.kind === "local" && options.source.fastForward !== undefined) {
    fastForwardLocalBranch(options.source.fastForward, logger);
  }
  // Resolved before the add: a post-checkout hook can commit onto the new branch during it.
  const startCommit =
    command.newBranchStartPoint === undefined
      ? undefined
      : resolveCommit(command.newBranchStartPoint);
  const preexistingConfig: BranchConfig =
    startCommit === undefined ? new Map<string, readonly string[]>() : readBranchConfig(normalized);
  const seedCheckout =
    (startCommit ?? resolveCommit(normalized)) !== undefined && canSeedCheckout(options.sourceRoot);
  if (seedCheckout) {
    command.args.splice(2, 0, "--no-checkout");
  }
  logger.step(`git ${command.args.join(" ")}`);
  git(...command.args);

  const ref = `refs/heads/${normalized}`;
  options.onCreated({
    directory: destinationDirectory,
    createdBranch:
      startCommit !== undefined && resolveCommit(ref) === startCommit
        ? { name: normalized, ref, commit: startCommit, preexistingConfig }
        : undefined,
  });
  if (seedCheckout) {
    const shared = await checkoutTrackedFiles(options.sourceRoot, destinationDirectory);
    logger.detail(`Tracked files sharing disk space: ${shared}.`);
  }
}
