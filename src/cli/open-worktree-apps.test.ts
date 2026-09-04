import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusLogger } from "../output/create-status-logger.js";

vi.mock("open", () => ({ default: vi.fn() }));

const openModule = await import("open");
const openWorktreeAppsModule = await import("./open-worktree-apps.js");

const open = vi.mocked(openModule.default);
const { openWorktreeApps } = openWorktreeAppsModule;

const noop = (message: string): void => {
  void message;
};

const createLogger = (step: StatusLogger["step"] = vi.fn(noop)): StatusLogger => ({
  step,
  success: vi.fn(noop),
  detail: vi.fn(noop),
  warn: vi.fn(noop),
});

describe("openWorktreeApps", () => {
  beforeEach(() => {
    open.mockReset();
  });

  it("does not launch anything when the target is none", async () => {
    await expect(openWorktreeApps("/repo/project", { type: "none" })).resolves.toBeUndefined();

    expect(open).not.toHaveBeenCalled();
  });

  it("opens the destination with the OS default handler", async () => {
    await expect(openWorktreeApps("/repo/project", { type: "default" })).resolves.toBeUndefined();

    expect(open).toHaveBeenCalledWith("/repo/project", { wait: false });
  });

  it("logs default-handler failures without rejecting", async () => {
    open.mockRejectedValue(new Error("no handler"));
    const logger = createLogger();

    await expect(
      openWorktreeApps("/repo/project", { type: "default" }, { logger }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith('Failed to open "/repo/project": no handler.');
  });

  it("logs open failures without rejecting", async () => {
    open.mockRejectedValue(new Error("missing app"));
    const logger = createLogger();

    await expect(
      openWorktreeApps("/repo/project", { type: "apps", apps: ["Ghostty"] }, { logger }),
    ).resolves.toBeUndefined();

    expect(open).toHaveBeenCalledWith("/repo/project", {
      app: { name: ["Ghostty"] },
      wait: false,
    });
    expect(logger.warn).toHaveBeenCalledWith('Failed to open "Ghostty": missing app.');
  });
});
