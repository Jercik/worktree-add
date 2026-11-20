import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleExistingDirectory } from "./destination-directory.js";
import type { StatusLogger } from "../output/create-status-logger.js";

vi.mock("trash");
vi.mock("../git/git.js");

const gitModule = await import("../git/git.js");
const trashModule = await import("trash");

const { fileExists, confirm, git } = gitModule;
const trash = trashModule.default;
const originalCi = process.env.CI;
const originalStdinIsTty = process.stdin.isTTY;

const createLogger = (): StatusLogger => ({
  step: vi.fn((message: string): void => {
    void message;
  }),
  success: vi.fn((message: string): void => {
    void message;
  }),
  detail: vi.fn((message: string): void => {
    void message;
  }),
  warn: vi.fn((message: string): void => {
    void message;
  }),
});

const setStdinIsTty = (value: boolean | undefined): void => {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value,
  });
};

describe("handleExistingDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(git).mockReturnValue("");
    delete process.env.CI;
    setStdinIsTty(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setStdinIsTty(originalStdinIsTty);
    if (originalCi === undefined) {
      delete process.env.CI;
      return;
    }
    process.env.CI = originalCi;
  });

  it("returns early when directory does not exist", async () => {
    vi.mocked(fileExists).mockResolvedValue(false);
    const logger = createLogger();

    await handleExistingDirectory("/test/path", { logger });

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });

  it("leaves the directory in place when user declines to remove it", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(false);
    const logger = createLogger();

    const result = await handleExistingDirectory("/test/path", { interactive: true, logger });

    expect(result).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(console.error).toHaveBeenCalledWith("Operation cancelled.");
    expect(trash).not.toHaveBeenCalled();
  });

  it("moves directory to trash when user confirms", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(trash).mockResolvedValue(void 0);
    const logger = createLogger();

    await handleExistingDirectory("/test/path", { interactive: true, logger });

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(logger.step).toHaveBeenCalledWith("Moving existing directory 'path' to trash...");
    expect(trash).toHaveBeenCalledWith("/test/path");
    expect(logger.success).toHaveBeenCalledWith("Directory moved to trash successfully");
  });

  it("throws with the trash error as its cause when trash operation fails", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(true);
    const trashError = new Error("Permission denied");
    vi.mocked(trash).mockRejectedValue(trashError);
    const logger = createLogger();

    await expect(
      handleExistingDirectory("/test/path", { interactive: true, logger }),
    ).rejects.toMatchObject({
      message: "Failed to move existing directory to trash: Permission denied",
      cause: trashError,
    });

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(trash).toHaveBeenCalledWith("/test/path");
    expect(logger.detail).not.toHaveBeenCalled();
  });

  it("handles non-Error exceptions from trash operation", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(trash).mockRejectedValue("String error");
    const logger = createLogger();

    await expect(
      handleExistingDirectory("/test/path", { interactive: true, logger }),
    ).rejects.toThrow("Failed to move existing directory to trash: String error");
  });

  it("includes recovery hint in confirmation message", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(false);
    const logger = createLogger();

    await handleExistingDirectory("/test/my-worktree", {
      interactive: true,
      logger,
    });

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("You can restore it from your system trash"),
    );
  });

  it("warns instead of prompting during a non-interactive dry run in CI", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    process.env.CI = "true";
    const logger = createLogger();

    const result = await handleExistingDirectory("/test/path", {
      dryRun: true,
      logger,
    });

    expect(result).not.toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "Dry run: directory 'path' already exists (CI is enabled). Refusing to prompt in non-interactive mode. Re-run with --interactive to confirm, or --yes to move it to trash.",
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });

  it("warns instead of prompting during an interactive CI dry run without a TTY", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    process.env.CI = "1";
    setStdinIsTty(false);
    const logger = createLogger();

    const result = await handleExistingDirectory("/test/path", {
      dryRun: true,
      interactive: true,
      logger,
    });

    expect(result).not.toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "Dry run: directory 'path' already exists, and CI mode is enabled. Interactive prompts are disabled in CI. Re-run with --yes to move the directory to trash, or remove it manually.",
    );
    expect(confirm).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });

  it("throws instead of prompting in non-interactive live mode", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    process.env.CI = "true";
    const logger = createLogger();

    await expect(handleExistingDirectory("/test/path", { logger })).rejects.toThrow(
      `Directory 'path' already exists (CI is enabled).
Refusing to prompt in non-interactive mode.
Re-run with --interactive to confirm, or --yes to move it to trash.`,
    );

    expect(confirm).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });
});
