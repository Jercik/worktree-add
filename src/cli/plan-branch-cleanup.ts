import type { CreatedBranch } from "../git/create-worktree.js";

interface PlanBranchCleanupInput {
  readonly createdBranch: CreatedBranch;
  readonly currentCommit: string | undefined;
  readonly checkedOutAt: string | undefined;
}

type BranchCleanupPlan =
  | { readonly action: "delete" }
  | { readonly action: "keep"; readonly message: string }
  | { readonly action: "none" };

export function planBranchCleanup({
  createdBranch,
  currentCommit,
  checkedOutAt,
}: PlanBranchCleanupInput): BranchCleanupPlan {
  if (currentCommit === undefined) {
    return { action: "none" };
  }
  if (checkedOutAt !== undefined) {
    return {
      action: "keep",
      message: `Keeping branch '${createdBranch.name}' because it is checked out at ${JSON.stringify(checkedOutAt)}.`,
    };
  }
  if (currentCommit !== createdBranch.commit) {
    return {
      action: "keep",
      message: `Keeping branch '${createdBranch.name}' because it no longer points at the commit this run created it at.`,
    };
  }
  return { action: "delete" };
}
