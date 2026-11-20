import type { StatusLogger } from "../output/create-status-logger.js";
import { extractDiagnosticLine } from "./extract-diagnostic-line.js";
import { git } from "./git.js";

export interface BranchFastForward {
  readonly branch: string;
  readonly from: string;
  readonly to: string;
}

export function fastForwardLocalBranch(
  { branch, from, to }: BranchFastForward,
  logger: StatusLogger,
): void {
  logger.detail(`Fast-forwarding '${branch}' from ${from} to ${to}.`);
  logger.step(`Fast-forwarding local '${branch}' to origin/${branch} …`);
  try {
    // A prompt can separate the check from this update, so move the branch only if it is still at `from`.
    git("update-ref", "-m", "worktree-add: fast-forward", `refs/heads/${branch}`, to, from);
  } catch (error) {
    throw new Error(
      `Failed to fast-forward '${branch}' to origin/${branch}: ${extractDiagnosticLine(error)}\n` +
        `If '${branch}' changed while worktree-add was running, re-run it.`,
      { cause: error },
    );
  }
}
