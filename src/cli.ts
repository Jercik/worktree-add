#!/usr/bin/env -S node --experimental-strip-types
/**
 * worktree-add.ts
 *
 * Create or reuse a Git worktree for <branch> as a sibling of the current worktree.
 * Note: the destination is placed next to whichever worktree you run this from,
 * not necessarily the original "main" checkout.
 */

import path from "node:path";
import { Command } from "commander";
import open from "open";
import packageJson from "../package.json" with { type: "json" };
import { getUnsafeAppNameReason } from "./app/get-unsafe-app-name-reason.js";
import { resolveApps } from "./app/resolve-apps.js";
import {
  git,
  getRepositoryName,
  normalizeBranchName,
  toSafePathSegment,
  findWorktreeByBranchName,
  exitWithMessage,
} from "./git/git.js";
import { copyUntrackedFiles } from "./worktree/untracked-file-copy.js";
import { fetchRemoteBranch, createWorktree } from "./git/worktree-creation.js";
import { handleExistingDirectory } from "./worktree/destination-directory.js";
import { setupProject } from "./project/setup.js";

function collectApp(app: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), app];
}

function formatForLog(value: string): string {
  return JSON.stringify(value);
}

async function main(
  branchRaw: string,
  options: { app?: string[] },
): Promise<void> {
  const branch = normalizeBranchName(branchRaw);
  if (branch.length === 0) {
    exitWithMessage(
      "Branch name is empty.\n" +
        "Examples: `feature/foo`, `origin/feature/foo`, `refs/heads/feature/foo`.\n" +
        "Note: `origin/` without a branch name is not valid.",
    );
  }

  // Prevent attempting to add a worktree for a branch that is already checked out
  const existingWorktree = findWorktreeByBranchName(branch);
  if (existingWorktree) {
    exitWithMessage(
      `Branch '${branch}' is already checked out in: ${existingWorktree}\n` +
        "You cannot add another worktree for the same branch.\n" +
        "Open that worktree instead or remove it before retrying.",
    );
  }

  // Determine destination directory for the new worktree
  const repoRoot = git("rev-parse", "--show-toplevel");
  const repoName = getRepositoryName();
  const branchDirectorySegment = toSafePathSegment(branch);
  const destinationDirectory = path.join(
    path.dirname(repoRoot),
    `${repoName}-${branchDirectorySegment}`,
  );

  // Check if destination directory already exists
  await handleExistingDirectory(destinationDirectory);

  // Step 1: Fetch remote branch if it exists
  const remoteBranchExistsHint = fetchRemoteBranch(branch);

  // Step 2: Create the worktree
  createWorktree(branch, destinationDirectory, {
    remoteBranchExists: remoteBranchExistsHint,
  });

  // Step 3: Copy untracked files, excluding any on the denylist
  await copyUntrackedFiles(repoRoot, destinationDirectory);

  // Step 4: Install dependencies and run project-specific setup
  await setupProject(destinationDirectory);

  // Step 5: Open the new worktree in requested apps
  const apps = resolveApps({
    optionApps: options.app,
    environmentApps: process.env.WORKTREE_ADD_APP,
  });

  for (const app of apps) {
    const unsafeReason = getUnsafeAppNameReason(app);
    if (unsafeReason) {
      console.error(
        `Skipping app ${formatForLog(app)}: ${unsafeReason}. The worktree was created successfully.`,
      );
      continue;
    }

    console.log(`➤ Opening ${formatForLog(app)} …`);
    try {
      // Best-effort: `open()` resolves when the subprocess is spawned. We do not wait
      // for apps to finish launching (or exit).
      await open(destinationDirectory, { app: { name: app }, wait: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to open ${formatForLog(app)}: ${message}. The worktree was created successfully.`,
      );
    }
  }
}

const program = new Command()
  .name(packageJson.name)
  .description(
    "Create or reuse a Git worktree for a branch as a sibling of the current worktree",
  )
  .version(packageJson.version)
  .argument("<branch>", "branch name for the worktree")
  .option(
    "-a, --app <name>",
    "Repeatable. Apps to open the worktree in (detached; arguments are not parsed; or set WORKTREE_ADD_APP env var, comma-separated)",
    collectApp,
  )
  .action(async (branch: string, options: { app?: string[] }) => {
    try {
      await main(branch, options);
    } catch (error: unknown) {
      console.error(error);
      process.exitCode = 1;
    }
  });

if (!process.env.VITEST) {
  program.parse();
}
