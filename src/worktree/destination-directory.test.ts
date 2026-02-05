import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleExistingDirectory } from "./destination-directory.js";
import type { StatusLogger } from "../output/create-status-logger.js";

// Mock dependencies
vi.mock("trash");
vi.mock("../git/git.js");

// Import mocked modules - separate to avoid linting issues with member access
const gitModule = await import("../git/git.js");
const trashModule = await import("trash");

const { fileExists, confirm, exitWithMessage, git } = gitModule;
const trash = trashModule.default;

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

describe("handleExistingDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console mocks
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(git).mockReturnValue("");
  });

  it("returns early when directory does not exist", async () => {
    vi.mocked(fileExists).mockResolvedValue(false);
    const logger = createLogger();

    await handleExistingDirectory("/test/path", { logger });

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });

  it("exits cleanly when user declines to remove directory", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(false);
    const logger = createLogger();

    // Mock process.exit to throw an error to stop execution
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Process exit");
    });

    await expect(
      handleExistingDirectory("/test/path", { interactive: true, logger }),
    ).rejects.toThrowError("Process exit");

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(console.error).toHaveBeenCalledWith("Operation cancelled.");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(trash).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("moves directory to trash when user confirms", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(trash).mockResolvedValue(void 0);
    const logger = createLogger();

    await handleExistingDirectory("/test/path", { interactive: true, logger });

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(logger.step).toHaveBeenCalledWith(
      "Moving existing directory 'path' to trash...",
    );
    expect(trash).toHaveBeenCalledWith("/test/path");
    expect(logger.success).toHaveBeenCalledWith(
      "Directory moved to trash successfully",
    );
  });

  it("logs error details and exits when trash operation fails", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(true);
    const trashError = new Error("Permission denied");
    trashError.stack = "Error: Permission denied";
    vi.mocked(trash).mockRejectedValue(trashError);
    const logger = createLogger();

    await handleExistingDirectory("/test/path", { interactive: true, logger });

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(trash).toHaveBeenCalledWith("/test/path");
    expect(logger.detail).toHaveBeenCalledWith(
      "Error details: Error: Permission denied",
    );
    expect(exitWithMessage).toHaveBeenCalledWith(
      "Failed to move existing directory to trash: Permission denied",
    );
  });

  it("handles non-Error exceptions from trash operation", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(trash).mockRejectedValue("String error");
    const logger = createLogger();

    await handleExistingDirectory("/test/path", { interactive: true, logger });

    expect(logger.detail).toHaveBeenCalledWith("Error details: String error");
    expect(exitWithMessage).toHaveBeenCalledWith(
      "Failed to move existing directory to trash: String error",
    );
  });

  it("includes recovery hint in confirmation message", async () => {
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(confirm).mockResolvedValue(false);
    const logger = createLogger();

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Process exit");
    });

    await expect(
      handleExistingDirectory("/test/my-worktree", {
        interactive: true,
        logger,
      }),
    ).rejects.toThrowError("Process exit");

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("You can restore it from your system trash"),
    );

    exitSpy.mockRestore();
  });
});
