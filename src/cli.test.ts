import { describe, expect, it } from "vitest";

import { isEditorCommandSafe, resolveEditor } from "./cli.js";
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

describe("resolveEditor", () => {
  it("prefers an explicit option over env var and default", () => {
    expect(
      resolveEditor({ optionEditor: "vim", environmentEditor: "cursor" }),
    ).toBe("vim");
  });

  it("falls back to env var when option is absent", () => {
    expect(resolveEditor({ environmentEditor: "cursor" })).toBe("cursor");
  });

  it("uses 'code' when neither option nor env var is provided", () => {
    expect(resolveEditor()).toBe("code");
  });

  it("treats empty strings as absent and falls back in order", () => {
    expect(
      resolveEditor({ optionEditor: "", environmentEditor: "cursor" }),
    ).toBe("cursor");
    expect(resolveEditor({ optionEditor: "", environmentEditor: "" })).toBe(
      "code",
    );
  });
});

describe("isEditorCommandSafe", () => {
  it("rejects editor commands containing shell metacharacters", () => {
    expect(isEditorCommandSafe("code; rm -rf /")).toBe(false);
    expect(isEditorCommandSafe("code | less")).toBe(false);
    expect(isEditorCommandSafe("cursor\nvim")).toBe(false);
    expect(isEditorCommandSafe("code$(whoami)")).toBe(false);
    expect(isEditorCommandSafe("code<file")).toBe(false);
    expect(isEditorCommandSafe("code>file")).toBe(false);
    expect(isEditorCommandSafe("code{1..2}")).toBe(false);
    expect(isEditorCommandSafe("code\tfile")).toBe(false);
    expect(isEditorCommandSafe("code\rfile")).toBe(false);
    expect(isEditorCommandSafe("code\0file")).toBe(false);
  });

  it("accepts simple editor command names", () => {
    expect(isEditorCommandSafe("code")).toBe(true);
    expect(isEditorCommandSafe("vim")).toBe(true);
  });
});
