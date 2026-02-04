import { describe, expect, it } from "vitest";

import { resolveApps } from "./resolve-apps.js";

describe("resolveApps", () => {
  it("returns CLI apps when both CLI and env are provided", () => {
    expect(
      resolveApps({
        optionApps: ["ghostty"],
        environmentApps: "code",
      }),
    ).toStrictEqual(["ghostty"]);
  });

  it("returns multiple CLI apps", () => {
    expect(resolveApps({ optionApps: ["ghostty", "code"] })).toStrictEqual([
      "ghostty",
      "code",
    ]);
  });

  it("falls back to env var when CLI apps are absent", () => {
    expect(resolveApps({ environmentApps: "code" })).toStrictEqual(["code"]);
  });

  it("splits comma-separated env var into multiple apps", () => {
    expect(resolveApps({ environmentApps: "ghostty,code" })).toStrictEqual([
      "ghostty",
      "code",
    ]);
  });

  it("trims whitespace from env var entries", () => {
    expect(resolveApps({ environmentApps: " ghostty , code " })).toStrictEqual([
      "ghostty",
      "code",
    ]);
  });

  it("trims whitespace from CLI app entries", () => {
    expect(resolveApps({ optionApps: [" ghostty ", " code "] })).toStrictEqual([
      "ghostty",
      "code",
    ]);
  });

  it("returns empty array when nothing is specified", () => {
    expect(resolveApps({})).toStrictEqual([]);
  });

  it("treats empty strings as absent", () => {
    expect(resolveApps({ environmentApps: "" })).toStrictEqual([]);

    expect(resolveApps({ environmentApps: "   " })).toStrictEqual([]);
  });

  it("overrides env var to open nothing when CLI apps are all whitespace", () => {
    expect(
      resolveApps({ optionApps: ["  ", ""], environmentApps: "code" }),
    ).toStrictEqual([]);
  });

  it("filters out empty entries from comma-separated env var", () => {
    expect(resolveApps({ environmentApps: "ghostty,,code," })).toStrictEqual([
      "ghostty",
      "code",
    ]);
  });

  it("de-duplicates apps while preserving order (CLI)", () => {
    expect(
      resolveApps({ optionApps: ["code", "code", "ghostty", "code"] }),
    ).toStrictEqual(["code", "ghostty"]);
  });

  it("de-duplicates apps while preserving order (env var)", () => {
    expect(
      resolveApps({ environmentApps: "code,code,ghostty,code" }),
    ).toStrictEqual(["code", "ghostty"]);
  });
});
