#!/usr/bin/env -S node --experimental-strip-types
/**
 * worktree-add.ts
 *
 * Create or reuse a Git worktree for <branch> as a sibling of the current worktree.
 * Note: the destination is placed next to whichever worktree you run this from,
 * not necessarily the original "main" checkout.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
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
import { resolveBranchHeadMismatch } from "./git/resolve-branch-head-mismatch.js";
import { handleExistingDirectory } from "./worktree/destination-directory.js";
import { setupProject } from "./project/setup.js";

interface ResolveEditorInput {
  optionEditor?: string;
  environmentEditor?: string;
}

export function resolveEditor({
  optionEditor,
  environmentEditor,
}: ResolveEditorInput = {}): string {
  const normalizedOption = optionEditor?.trim();
  const normalizedEnvironment = environmentEditor?.trim();
  return normalizedOption || normalizedEnvironment || "code";
}

export function isEditorCommandSafe(editor: string): boolean {
  const normalized = editor.normalize("NFKC");
  const trimmed = normalized.trim();

  // Reject empty or excessively long commands
  if (trimmed.length === 0 || trimmed.length > 256) {
    return false;
  }

  // Reject common shell metacharacters, whitespace, and control characters to prevent injection
  const unsafeCharacters = /[\\;&|`$(){}<>\s]|\p{Cc}/u;
  return !unsafeCharacters.test(trimmed);
}

async function main(
  branchRaw: string,
  options: { editor?: string },
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

  const shouldContinue = await resolveBranchHeadMismatch(branch);
  if (!shouldContinue) return;

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

  // Step 5: Open the new worktree in the editor
  const editor = resolveEditor({
    optionEditor: options.editor,
    environmentEditor: process.env.WORKTREE_ADD_EDITOR,
  });

  // Validate editor command to prevent injection attacks
  if (!isEditorCommandSafe(editor)) {
    exitWithMessage(
      "Invalid editor command: shell metacharacters not allowed.\n" +
        "Please use a simple editor name (e.g., 'code', 'cursor', 'vim').",
    );
  }

  console.log(`➤ Opening ${editor} …`);
  const result = spawnSync(editor, [destinationDirectory], {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to open ${editor}: ${result.error.message}`);
    console.error(
      "The worktree was created successfully, but the editor could not be opened.",
    );
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
    "-e, --editor <command>",
    "Editor to open the worktree with (default: WORKTREE_ADD_EDITOR env var or 'code')",
  )
  .action(async (branch: string, options: { editor?: string }) => {
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
