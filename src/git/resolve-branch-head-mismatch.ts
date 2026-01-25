/**
 * resolve-branch-head-mismatch.ts
 *
 * Warn and resolve mismatched local/remote branch heads.
 */

import {
  confirm,
  fetchOriginBranch,
  getLocalBranchHead,
  getRemoteBranchHead,
  git,
  hasUncommittedChanges,
  localBranchExists,
  normalizeBranchName,
  prompt,
  remoteBranchExists,
  stashChanges,
} from "./git.js";

import {
  parseResolutionChoice,
  parseUncommittedChoice,
} from "./parse-branch-head-mismatch-choice.js";

import type { ResolutionChoice } from "./parse-branch-head-mismatch-choice.js";

const shortHash = (value: string): string => value.slice(0, 7);

const getAheadBehindCounts = (
  localHead: string,
  remoteHead: string,
): { ahead: number; behind: number } => {
  const output = git(
    "rev-list",
    "--left-right",
    "--count",
    `${localHead}...${remoteHead}`,
  );
  const [aheadRaw, behindRaw] = output.split(/\s+/u);
  const ahead = Number.parseInt(aheadRaw ?? "0");
  const behind = Number.parseInt(behindRaw ?? "0");
  return {
    ahead: Number.isNaN(ahead) ? 0 : ahead,
    behind: Number.isNaN(behind) ? 0 : behind,
  };
};

const promptResolution = async (
  branch: string,
  localHead: string,
  remoteHead: string,
  ahead: number,
  behind: number,
): Promise<ResolutionChoice> => {
  const updateLabel =
    ahead > 0
      ? `Update local branch to match origin (drops ${ahead} local commit${ahead === 1 ? "" : "s"})`
      : "Update local branch to match origin (fast-forward)";
  const defaultChoice =
    ahead === 0 && behind > 0 ? "update-local" : "keep-local";
  const defaultIndex = defaultChoice === "update-local" ? "2" : "1";

  console.warn(
    `⚠️  Local branch '${branch}' and origin/${branch} point to different commits.`,
  );
  console.warn(`  local:  ${shortHash(localHead)}`);
  console.warn(`  origin: ${shortHash(remoteHead)}`);
  if (ahead > 0 || behind > 0) {
    const descriptors: string[] = [];
    if (ahead > 0) descriptors.push(`ahead by ${ahead}`);
    if (behind > 0) descriptors.push(`behind by ${behind}`);
    console.warn(`  local is ${descriptors.join(" and ")} relative to origin`);
  }

  console.warn("Choose how to proceed:");
  console.warn("  1) Keep local branch (use local head for the worktree)");
  console.warn(`  2) ${updateLabel}`);
  console.warn("  3) Abort");

  for (;;) {
    const answer = await prompt(
      `Select an option (default: ${defaultIndex}): `,
    );
    const choice = parseResolutionChoice(answer, defaultChoice);
    if (choice) return choice;
    console.log("Please enter 1, 2, or 3.");
  }
};

const handleUncommittedChanges = async (branch: string): Promise<boolean> => {
  if (!hasUncommittedChanges()) return true;

  console.warn("⚠️  You have uncommitted changes in the current worktree.");
  console.warn(
    "Updating the local branch ref will not touch them, but you can stash first.",
  );

  for (;;) {
    const answer = await prompt(
      "Choose: [s]tash, [c]ontinue, [a]bort (default: c): ",
    );
    const choice = parseUncommittedChoice(answer, "continue");
    if (!choice) {
      console.log("Please enter s, c, or a.");
      continue;
    }
    if (choice === "stash") {
      console.log("➤ Stashing changes …");
      stashChanges(`worktree-add: before updating ${branch}`);
      return true;
    }
    if (choice === "continue") {
      return true;
    }
    console.log("Operation cancelled.");
    return false;
  }
};

export async function resolveBranchHeadMismatch(
  branch: string,
): Promise<boolean> {
  const normalized = normalizeBranchName(branch);
  if (!localBranchExists(normalized) || !remoteBranchExists(normalized)) {
    return true;
  }

  console.log(`➤ Fetching origin/${normalized} to check for divergence …`);
  fetchOriginBranch(normalized);

  const localHead = getLocalBranchHead(normalized);
  const remoteHead = getRemoteBranchHead(normalized);
  if (!localHead || !remoteHead || localHead === remoteHead) {
    return true;
  }

  const { ahead, behind } = getAheadBehindCounts(localHead, remoteHead);
  const resolution = await promptResolution(
    normalized,
    localHead,
    remoteHead,
    ahead,
    behind,
  );

  if (resolution === "abort") {
    console.log("Operation cancelled.");
    return false;
  }

  if (resolution === "keep-local") {
    return true;
  }

  const shouldContinue = await handleUncommittedChanges(normalized);
  if (!shouldContinue) return false;

  if (ahead > 0) {
    const confirmed = await confirm(
      `Updating local '${normalized}' will discard ${ahead} local commit${ahead === 1 ? "" : "s"} not on origin. Continue?`,
    );
    if (!confirmed) {
      console.log("Operation cancelled.");
      return false;
    }
  }

  console.log(
    `➤ Updating local branch '${normalized}' to origin/${normalized} …`,
  );
  git("branch", "-f", "--", normalized, `origin/${normalized}`);
  return true;
}
