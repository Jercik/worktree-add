import { describe, expect, it } from "vitest";

import { formatStaleStartPointMessage } from "./format-stale-start-point-message.js";

describe("formatStaleStartPointMessage", () => {
  it("suggests a fast-forward pull when the branch is only behind", () => {
    expect(
      formatStaleStartPointMessage("feature/new", {
        branch: "main",
        counts: { ahead: 0, behind: 2 },
      }),
    ).toBe(
      `Local 'main' is 2 commits behind origin/main.
Refusing to create 'feature/new' from an outdated HEAD.
Update 'main' first (for example with 'git pull --ff-only'), then retry.
To create the branch from the current HEAD anyway, pass --allow-stale.`,
    );
  });

  it("suggests a rebase or merge when the branch also has local commits", () => {
    expect(
      formatStaleStartPointMessage("feature/new", {
        branch: "main",
        counts: { ahead: 3, behind: 1 },
      }),
    ).toBe(
      `Local 'main' is 1 commit behind origin/main and has 3 commits that origin/main lacks.
Refusing to create 'feature/new' from an outdated HEAD.
Rebase or merge 'main' onto origin/main first (for example with 'git pull --rebase'), then retry.
To create the branch from the current HEAD anyway, pass --allow-stale.`,
    );
  });

  it("names no pull command when origin's commits were not counted", () => {
    expect(formatStaleStartPointMessage("feature/new", { branch: "main", counts: undefined })).toBe(
      `Local 'main' is behind origin/main.
Refusing to create 'feature/new' from an outdated HEAD.
Update 'main' from origin/main first, then retry.
To create the branch from the current HEAD anyway, pass --allow-stale.`,
    );
  });
});
