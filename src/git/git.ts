import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as readline from "node:readline/promises";

/**
 * Run a git command synchronously and return its trimmed stdout.
 * Any failure causes the script to throw.
 * @param args Git command arguments. If the last argument is an object with a `cwd` property,
 *             it will be used as the working directory for the command.
 */
export function git(
  ...arguments_: [...string[], { cwd?: string }] | string[]
): string {
  let cwd: string | undefined;
  let gitArguments: string[];

  // Check if the last argument is an options object
  const lastArgument = arguments_.at(-1);
  if (
    lastArgument &&
    typeof lastArgument === "object" &&
    "cwd" in lastArgument
  ) {
    cwd = (lastArgument as { cwd?: string }).cwd;
    gitArguments = arguments_.slice(0, -1) as string[];
  } else {
    gitArguments = arguments_ as string[];
  }

  const result = spawnSync("git", gitArguments, {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024, // 100 MB to accommodate large outputs
    ...(cwd && { cwd }),
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      result.stderr || `git ${gitArguments[0] ?? "command"} failed`,
    );
  }
  return result.stdout.trim();
}

/**
 * Normalize a Git branch reference to a simple branch name.
 *
 * This helper trims surrounding whitespace and removes common prefixes so the
 * resulting string matches the short local branch name used by refs under
 * `refs/heads/`.
 */
export function normalizeBranchName(name: string): string {
  const trimmed = name.trim();
  return trimmed
    .replace(/^refs\/heads\//u, "")
    .replace(/^refs\/remotes\/origin\//u, "")
    .replace(/^remotes\/origin\//u, "")
    .replace(/^origin\//u, "");
}

/**
 * Check if a local branch exists by verifying its ref.
 */
export function localBranchExists(branch: string): boolean {
  try {
    const normalized = normalizeBranchName(branch);
    git("show-ref", "--verify", "--quiet", `refs/heads/${normalized}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a remote branch exists on origin.
 */
export function remoteBranchExists(branch: string): boolean {
  try {
    const normalized = normalizeBranchName(branch);
    return !!git("ls-remote", "--heads", "origin", normalized);
  } catch {
    return false;
  }
}

/**
 * Fetch a branch from origin.
 */
export function fetchOriginBranch(branch: string): void {
  const normalized = normalizeBranchName(branch);
  const refspec = `+refs/heads/${normalized}:refs/remotes/origin/${normalized}`;
  const result = spawnSync("git", ["fetch", "origin", "--", refspec], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git fetch origin ${refspec} failed`);
  }
}

/**
 * Get the current head commit for a local branch.
 */
export function getLocalBranchHead(branch: string): string | undefined {
  try {
    const normalized = normalizeBranchName(branch);
    return git("rev-parse", `refs/heads/${normalized}`);
  } catch {
    return undefined;
  }
}

/**
 * Get the current head commit for a remote-tracking branch.
 */
export function getRemoteBranchHead(branch: string): string | undefined {
  try {
    const normalized = normalizeBranchName(branch);
    return git("rev-parse", `refs/remotes/origin/${normalized}`);
  } catch {
    return undefined;
  }
}

/**
 * Convert an arbitrary string to a filesystem-safe single path segment.
 *
 * Use this helper when constructing directory names from branch names or other
 * user-provided identifiers.
 */
export function toSafePathSegment(input: string): string {
  return input
    .trim()
    .replaceAll(/[\\/:*?"<>|]/gu, "-")
    .replaceAll(/\s+/gu, "-")
    .replaceAll(/\.+$/gu, "")
    .replaceAll(/-+/gu, "-");
}

/**
 * Check if a file exists at the given path.
 */
export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Print an error message and exit the process with status 1.
 */
export function exitWithMessage(message: string): never {
  console.error(message);
  // eslint-disable-next-line unicorn/no-process-exit -- This is a CLI helper function
  process.exit(1);
}

/**
 * Prompt for input and return the user's response.
 */
export async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

/**
 * Prompts user for yes/no confirmation
 * @param message The message to display to the user
 * @returns Promise<boolean> - true if user confirms, false otherwise
 */
export async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(`${message} [y/N] `);
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

/**
 * Check for uncommitted changes in the current worktree.
 */
export function hasUncommittedChanges(cwd?: string): boolean {
  const output = cwd
    ? git("status", "--porcelain", { cwd })
    : git("status", "--porcelain");
  return output.length > 0;
}

/**
 * Stash uncommitted changes, including untracked files.
 */
export function stashChanges(message: string, cwd?: string): void {
  if (cwd) {
    git("stash", "push", "-u", "-m", message, { cwd });
    return;
  }
  git("stash", "push", "-u", "-m", message);
}

// Re-export worktree parsing functions for backward compatibility
export {
  getRepositoryName,
  findWorktreeByBranchName,
} from "./worktree-discovery.js";
