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

async function main(
  branchRaw: string,
  options: { app?: string[] },
): Promise<void> {
  const branch = normalizeBranchName(branchRaw);

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
  fetchRemoteBranch(branch);

  // Step 2: Create the worktree
  createWorktree(branch, destinationDirectory);

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
    console.log(`➤ Opening ${app} …`);
    await open(destinationDirectory, { app: { name: app } });
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
    "-a, --app <names...>",
    "Apps to open the worktree in (or set WORKTREE_ADD_APP env var, comma-separated)",
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
