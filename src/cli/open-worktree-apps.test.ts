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
    vi.clearAllMocks();
  });

  it("logs open failures without rejecting", async () => {
    open.mockRejectedValue(new Error("missing app"));
    const logger = createLogger();

    await expect(
      openWorktreeApps("/repo/project", ["Ghostty"], { logger }),
    ).resolves.toBeUndefined();

    expect(open).toHaveBeenCalledWith("/repo/project", {
      app: { name: ["Ghostty"] },
      wait: false,
    });
    expect(logger.warn).toHaveBeenCalledWith('Failed to open "Ghostty": missing app.');
  });

  it("rejects unexpected app task failures", async () => {
    const logger = createLogger(() => {
      throw new Error("logger failed");
    });

    await expect(openWorktreeApps("/repo/project", ["Ghostty"], { logger })).rejects.toThrow(
      "logger failed",
    );

    expect(open).not.toHaveBeenCalled();
  });
});
