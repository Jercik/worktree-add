/**
 * worktree-discovery.ts
 *
 * Utilities for parsing Git worktree information
 */

import path from "node:path";
import { git } from "./git.js";

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
  const superprojectRoot = git("rev-parse", "--show-superproject-working-tree");
  return superprojectRoot.length === 0 ? undefined : superprojectRoot;
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
