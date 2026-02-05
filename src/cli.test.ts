import { describe, expect, it } from "vitest";

import { globToRegExp } from "./worktree/file-patterns.js";

describe("globToRegExp", () => {
  it("matches nested directories when using double star", () => {
    const regex = globToRegExp("config/**");
    expect(regex.test("config/.env")).toBe(true);
    expect(regex.test("config/nested/file.txt")).toBe(true);
    expect(regex.test("another/file.txt")).toBe(false);
  });

  it("limits single star to a segment", () => {
    const regex = globToRegExp("*.env");
    expect(regex.test(".env")).toBe(true);
    expect(regex.test("local.env")).toBe(true);
    expect(regex.test("nested/local.env")).toBe(false);
  });

  it("supports question mark placeholders", () => {
    const regex = globToRegExp("file?.txt");
    expect(regex.test("file1.txt")).toBe(true);
    expect(regex.test("fileA.txt")).toBe(true);
    expect(regex.test("file10.txt")).toBe(false);
  });
});
