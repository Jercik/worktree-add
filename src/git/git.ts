import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as readline from "node:readline/promises";

export function git(...arguments_: [...string[], { cwd?: string }] | string[]): string {
  let cwd: string | undefined;
  let gitArguments: string[];

  const lastArgument = arguments_.at(-1);
  if (lastArgument && typeof lastArgument === "object" && "cwd" in lastArgument) {
    cwd = lastArgument.cwd;
    gitArguments = arguments_.slice(0, -1) as string[];
  } else {
    gitArguments = arguments_ as string[];
  }

  const result = spawnSync("git", gitArguments, {
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024, // 100 MB to accommodate large outputs
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    ...(cwd && { cwd }),
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${gitArguments[0] ?? "command"} failed`);
  }
  return result.stdout.trim();
}

export function normalizeBranchName(name: string): string {
  const trimmed = name.trim();
  return trimmed
    .replace(/^refs\/heads\//u, "")
    .replace(/^refs\/remotes\/origin\//u, "")
    .replace(/^remotes\/origin\//u, "")
    .replace(/^origin\//u, "");
}

export function localBranchExists(branch: string): boolean {
  try {
    const normalized = normalizeBranchName(branch);
    git("show-ref", "--verify", "--quiet", `refs/heads/${normalized}`);
    return true;
  } catch {
    return false;
  }
}

// Network/auth failures surface so callers must choose whether offline fallback is allowed.
export function remoteBranchExists(branch: string): boolean {
  const normalized = normalizeBranchName(branch);
  // Use a fully-qualified ref to avoid option-parsing ambiguity for branch
  // names starting with '-'.
  return Boolean(git("ls-remote", "--heads", "origin", `refs/heads/${normalized}`));
}

// Fetch only refreshes the remote-tracking ref; local branch heads stay untouched.
export function fetchOriginBranch(branch: string): void {
  const normalized = normalizeBranchName(branch);
  const refspec = `+refs/heads/${normalized}:refs/remotes/origin/${normalized}`;
  git("fetch", "origin", "--", refspec);
}

export function getLocalBranchHead(branch: string): string | undefined {
  try {
    const normalized = normalizeBranchName(branch);
    return git("rev-parse", `refs/heads/${normalized}`);
  } catch {
    return undefined;
  }
}

export function getRemoteBranchHead(branch: string): string | undefined {
  try {
    const normalized = normalizeBranchName(branch);
    return git("rev-parse", `refs/remotes/origin/${normalized}`);
  } catch {
    return undefined;
  }
}

export function getAheadBehindCounts(
  localHead: string,
  remoteHead: string,
): { ahead: number; behind: number } {
  const output = git("rev-list", "--left-right", "--count", `${localHead}...${remoteHead}`);
  const [aheadRaw, behindRaw] = output.split(/\s+/u);
  const ahead = Number.parseInt(aheadRaw ?? "0", 10);
  const behind = Number.parseInt(behindRaw ?? "0", 10);
  return {
    ahead: Number.isNaN(ahead) ? 0 : ahead,
    behind: Number.isNaN(behind) ? 0 : behind,
  };
}

export function toSafePathSegment(input: string): string {
  return input
    .trim()
    .replaceAll(/[\\/:*?"<>|]/gu, "-")
    .replaceAll(/\s+/gu, "-")
    .replaceAll(/\.+$/gu, "")
    .replaceAll(/-+/gu, "-");
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function exitWithMessage(message: string): never {
  console.error(message);
  // eslint-disable-next-line unicorn/no-process-exit -- This is a CLI helper function
  process.exit(1);
}

async function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

export async function confirm(message: string): Promise<boolean> {
  const answer = await prompt(`${message} [y/N] `);
  const normalized = answer.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}
