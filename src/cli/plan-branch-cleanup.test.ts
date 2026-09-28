import { describe, expect, it } from "vitest";

import { planBranchCleanup } from "./plan-branch-cleanup.js";

const createdBranch = {
  name: "feature/new",
  ref: "refs/heads/feature/new",
  commit: "1111111111111111111111111111111111111111",
};

describe("planBranchCleanup", () => {
  it("deletes a branch still at the commit this run created it at", () => {
    expect(
      planBranchCleanup({
        createdBranch,
        currentCommit: "1111111111111111111111111111111111111111",
        checkedOutAt: undefined,
      }),
    ).toStrictEqual({ action: "delete" });
  });

  it("keeps a branch that moved after this run created it", () => {
    expect(
      planBranchCleanup({
        createdBranch,
        currentCommit: "2222222222222222222222222222222222222222",
        checkedOutAt: undefined,
      }),
    ).toStrictEqual({
      action: "keep",
      message:
        "Keeping branch 'feature/new' because it no longer points at the commit this run created it at.",
    });
  });

  it("keeps a branch that a worktree still has checked out", () => {
    expect(
      planBranchCleanup({
        createdBranch,
        currentCommit: "1111111111111111111111111111111111111111",
        checkedOutAt: "/repo/app-feature-new",
      }),
    ).toStrictEqual({
      action: "keep",
      message: `Keeping branch 'feature/new' because it is checked out at "/repo/app-feature-new".`,
    });
  });

  it("does nothing when the branch no longer exists", () => {
    expect(
      planBranchCleanup({
        createdBranch,
        currentCommit: undefined,
        checkedOutAt: undefined,
      }),
    ).toStrictEqual({ action: "none" });
  });
});
