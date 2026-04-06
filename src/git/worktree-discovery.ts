/**
 * worktree-discovery.ts
 *
 * Utilities for parsing Git worktree information
 */

import path from "node:path";
import { git } from "./git.js";

const MAX_SUPERPROJECT_NESTING = 10;

export function getCurrentWorktreeRoot(): string {
  return git("rev-parse", "--show-toplevel");
}

function getGitCommonDirectory(): string {
  const repoRoot = getCurrentWorktreeRoot();
  const commonDirectory = git("rev-parse", "--git-common-dir", {
    cwd: repoRoot,
  });
  return path.resolve(repoRoot, commonDirectory);
}

function getMainWorktreePath(): string {
  const repoRoot = getCurrentWorktreeRoot();
  const commonDirectory = getGitCommonDirectory();
  const configuredWorktree = git(
    "config",
    "--file",
    path.join(commonDirectory, "config"),
    "--default",
    "",
    "--get",
    "core.worktree",
  );

  if (configuredWorktree.length === 0) {
    const primaryWorktreeLine = git("worktree", "list", "--porcelain")
      .split(/\n/u)
      .find((line) => line.startsWith("worktree "));

    if (primaryWorktreeLine === undefined) {
      return repoRoot;
    }

    const primaryWorktreePath = path.resolve(
      primaryWorktreeLine.replace(/^worktree\s+/u, "").trim(),
    );

    return primaryWorktreePath === commonDirectory
      ? repoRoot
      : primaryWorktreePath;
  }

  return path.resolve(commonDirectory, configuredWorktree);
}

export function getSuperprojectRoot(): string | undefined {
  let currentDirectory = getCurrentWorktreeRoot();
  let topmostSuperprojectRoot = git(
    "rev-parse",
    "--show-superproject-working-tree",
    { cwd: currentDirectory },
  );

  if (topmostSuperprojectRoot.length === 0) {
    return undefined;
  }

  for (let depth = 1; depth < MAX_SUPERPROJECT_NESTING; depth += 1) {
    currentDirectory = topmostSuperprojectRoot;
    const superprojectRoot = git(
      "rev-parse",
      "--show-superproject-working-tree",
      { cwd: currentDirectory },
    );

    if (superprojectRoot.length === 0) {
      return topmostSuperprojectRoot;
    }

    topmostSuperprojectRoot = superprojectRoot;
  }

  throw new Error(
    `Expected at most ${MAX_SUPERPROJECT_NESTING} nested superprojects while resolving the topmost superproject`,
  );
}

/**
 * Get the repository name from the main visible repository directory.
 */
export function getRepositoryName(): string {
  return path.basename(getMainWorktreePath());
}

/**
 * Find the worktree path where the given branch is currently checked out.
 * Returns the worktree path if found, otherwise undefined.
 */
export function findWorktreeByBranchName(
  branchName: string,
): string | undefined {
  const commonDirectory = getGitCommonDirectory();
  const mainWorktreePath = getMainWorktreePath();
  const wtList = git("worktree", "list", "--porcelain");
  const wtLines = wtList.split(/\n/u);

  let currentWorktreePath: string | undefined;

  for (const line of wtLines) {
    if (line.startsWith("worktree ")) {
      const listedWorktreePath = path.resolve(
        line.replace(/^worktree\s+/u, "").trim(),
      );
      currentWorktreePath =
        listedWorktreePath === commonDirectory
          ? mainWorktreePath
          : listedWorktreePath;
    } else if (line.startsWith("branch ") && currentWorktreePath) {
      const referenceOrName = line.replace(/^branch\s+/u, "").trim();
      const shortName = referenceOrName.startsWith("refs/heads/")
        ? referenceOrName.slice("refs/heads/".length)
        : referenceOrName;
      if (shortName === branchName) {
        return currentWorktreePath;
      }
    }
  }

  return undefined;
}
