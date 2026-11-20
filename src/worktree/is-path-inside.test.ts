import { describe, expect, it } from "vitest";
import { isPathInside } from "./is-path-inside.js";

describe("isPathInside", () => {
  it.each([
    { candidate: "/repos/app", expected: true },
    { candidate: "/repos/app/src/index.ts", expected: true },
    { candidate: "/repos/app/..notes", expected: true },
    { candidate: "/repos", expected: false },
    { candidate: "/repos/app-feature", expected: false },
    { candidate: "/repos/app/../other", expected: false },
  ])("returns $expected for $candidate inside /repos/app", ({ candidate, expected }) => {
    expect(isPathInside("/repos/app", candidate)).toBe(expected);
  });
});
