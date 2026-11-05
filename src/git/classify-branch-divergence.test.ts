import { describe, expect, it } from "vitest";

import { classifyBranchDivergence } from "./classify-branch-divergence.js";

describe("classifyBranchDivergence", () => {
  it.each([
    { ahead: 15, behind: 1, expected: "diverged" },
    { ahead: 0, behind: 3, expected: "behind" },
    { ahead: 2, behind: 0, expected: "ahead" },
    { ahead: 0, behind: 0, expected: "even" },
  ])("classifies ahead $ahead, behind $behind as $expected", ({ ahead, behind, expected }) => {
    expect(classifyBranchDivergence({ ahead, behind })).toBe(expected);
  });
});
