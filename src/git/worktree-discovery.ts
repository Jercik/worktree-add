import path from "node:path";
import { git } from "./git.js";

const MAX_SUPERPROJECT_NESTING = 10;

export function getCurrentWorktreeRoot(): string {
  return git("rev-parse", "--show-toplevel");
}

function getGitCommonDirectory(repoRoot: string): string {
  const commonDirectory = git("rev-parse", "--git-common-dir", {
    cwd: repoRoot,
  });
  return path.resolve(repoRoot, commonDirectory);
}

function getConfiguredWorktree(commonDirectory: string): string {
  return git(
    "config",
    "--file",
    path.join(commonDirectory, "config"),
    "--default",
    "",
    "--get",
    "core.worktree",
  );
}

function getPrimaryWorktreePath(worktreeList: string): string | undefined {
  const primaryWorktreeLine = worktreeList
    .split(/\n/u)
    .find((line) => line.startsWith("worktree "));
  return primaryWorktreeLine === undefined
    ? undefined
    : path.resolve(primaryWorktreeLine.replace(/^worktree\s+/u, "").trim());
}

function resolveMainWorktreePath(
  repoRoot: string,
  commonDirectory: string,
  configuredWorktree: string,
  worktreeList: string,
): string {
  if (configuredWorktree.length > 0) {
    return path.resolve(commonDirectory, configuredWorktree);
  }

  const primaryWorktreePath = getPrimaryWorktreePath(worktreeList);
  if (primaryWorktreePath === undefined) {
    return repoRoot;
  }

  return primaryWorktreePath === commonDirectory ? repoRoot : primaryWorktreePath;
}

function getMainWorktreePath(): string {
  const repoRoot = getCurrentWorktreeRoot();
  const commonDirectory = getGitCommonDirectory(repoRoot);
  const configuredWorktree = getConfiguredWorktree(commonDirectory);
  const worktreeList =
    configuredWorktree.length === 0 ? git("worktree", "list", "--porcelain") : "";
  return resolveMainWorktreePath(repoRoot, commonDirectory, configuredWorktree, worktreeList);
}

export function getSuperprojectRoot(): string | undefined {
  let currentDirectory = getCurrentWorktreeRoot();
  let topmostSuperprojectRoot = git("rev-parse", "--show-superproject-working-tree", {
    cwd: currentDirectory,
  });

  if (topmostSuperprojectRoot.length === 0) {
    return undefined;
  }

  for (let depth = 1; depth < MAX_SUPERPROJECT_NESTING; depth += 1) {
    currentDirectory = topmostSuperprojectRoot;
    const superprojectRoot = git("rev-parse", "--show-superproject-working-tree", {
      cwd: currentDirectory,
    });

    if (superprojectRoot.length === 0) {
      return topmostSuperprojectRoot;
    }

    topmostSuperprojectRoot = superprojectRoot;
  }

  throw new Error(
    `Expected at most ${MAX_SUPERPROJECT_NESTING} nested superprojects while resolving the topmost superproject`,
  );
}

export function getRepositoryName(): string {
  return path.basename(getMainWorktreePath());
}

export function findWorktreeByBranchName(branchName: string): string | undefined {
  const repoRoot = getCurrentWorktreeRoot();
  const commonDirectory = getGitCommonDirectory(repoRoot);
  const configuredWorktree = getConfiguredWorktree(commonDirectory);
  const worktreeList = git("worktree", "list", "--porcelain");
  const mainWorktreePath = resolveMainWorktreePath(
    repoRoot,
    commonDirectory,
    configuredWorktree,
    worktreeList,
  );
  const worktreeLines = worktreeList.split(/\n/u);

  let currentWorktreePath: string | undefined;

  for (const line of worktreeLines) {
    if (line.startsWith("worktree ")) {
      const listedWorktreePath = path.resolve(line.replace(/^worktree\s+/u, "").trim());
      currentWorktreePath =
        listedWorktreePath === commonDirectory ? mainWorktreePath : listedWorktreePath;
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
