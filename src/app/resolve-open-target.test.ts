import { describe, expect, it } from "vitest";

import { resolveOpenTarget } from "./resolve-open-target.js";

describe("resolveOpenTarget", () => {
  it("returns CLI apps when both CLI and env are provided", () => {
    expect(
      resolveOpenTarget({
        optionApps: ["ghostty"],
        environmentApps: "code",
        open: false,
      }),
    ).toStrictEqual({ type: "apps", apps: ["ghostty"] });
  });

  it("returns multiple CLI apps", () => {
    expect(
      resolveOpenTarget({
        optionApps: ["ghostty", "code"],
        environmentApps: undefined,
        open: false,
      }),
    ).toStrictEqual({ type: "apps", apps: ["ghostty", "code"] });
  });

  it("does not open env apps unless --open is set", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: "code",
        open: false,
      }),
    ).toStrictEqual({ type: "none" });
  });

  it("opens env apps when --open is set", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: "code",
        open: true,
      }),
    ).toStrictEqual({ type: "apps", apps: ["code"] });
  });

  it("splits comma-separated env var into multiple apps when --open is set", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: "ghostty,code",
        open: true,
      }),
    ).toStrictEqual({ type: "apps", apps: ["ghostty", "code"] });
  });

  it("trims whitespace from env var entries when --open is set", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: " ghostty , code ",
        open: true,
      }),
    ).toStrictEqual({ type: "apps", apps: ["ghostty", "code"] });
  });

  it("trims whitespace from CLI app entries", () => {
    expect(
      resolveOpenTarget({
        optionApps: [" ghostty ", " code "],
        environmentApps: undefined,
        open: false,
      }),
    ).toStrictEqual({ type: "apps", apps: ["ghostty", "code"] });
  });

  it("returns none when nothing is specified", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: undefined,
        open: false,
      }),
    ).toStrictEqual({ type: "none" });
  });

  it("opens the OS default handler when --open is set and no apps are configured", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: undefined,
        open: true,
      }),
    ).toStrictEqual({ type: "default" });
  });

  it("opens the OS default handler when --open is set and env is empty", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: "",
        open: true,
      }),
    ).toStrictEqual({ type: "default" });
  });

  it("opens the OS default handler when --open is set and env is whitespace", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: "   ",
        open: true,
      }),
    ).toStrictEqual({ type: "default" });
  });

  it("treats whitespace-only CLI apps as absent and does not open env apps without --open", () => {
    expect(
      resolveOpenTarget({
        optionApps: ["  "],
        environmentApps: "code",
        open: false,
      }),
    ).toStrictEqual({ type: "none" });
  });

  it("falls back to env apps when CLI apps are whitespace-only and --open is set", () => {
    expect(
      resolveOpenTarget({
        optionApps: ["  "],
        environmentApps: "code",
        open: true,
      }),
    ).toStrictEqual({ type: "apps", apps: ["code"] });
  });

  it("overrides env apps to open nothing when CLI apps include an explicit empty string", () => {
    expect(
      resolveOpenTarget({
        optionApps: [""],
        environmentApps: "code",
        open: true,
      }),
    ).toStrictEqual({ type: "none" });
  });

  it("filters out empty entries from comma-separated env var when --open is set", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: "ghostty,,code,",
        open: true,
      }),
    ).toStrictEqual({ type: "apps", apps: ["ghostty", "code"] });
  });

  it("de-duplicates apps while preserving order (CLI)", () => {
    expect(
      resolveOpenTarget({
        optionApps: ["code", "code", "ghostty", "code"],
        environmentApps: undefined,
        open: false,
      }),
    ).toStrictEqual({ type: "apps", apps: ["code", "ghostty"] });
  });

  it("de-duplicates apps while preserving order (env var)", () => {
    expect(
      resolveOpenTarget({
        optionApps: undefined,
        environmentApps: "code,code,ghostty,code",
        open: true,
      }),
    ).toStrictEqual({ type: "apps", apps: ["code", "ghostty"] });
  });
});
