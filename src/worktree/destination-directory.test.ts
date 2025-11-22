import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { handleExistingDirectory } from "./destination-directory.js";

// Mock dependencies
vi.mock("trash");
vi.mock("../git/git.js");

// Import mocked modules - separate to avoid linting issues with member access
const gitModule = await import("../git/git.js");
const trashModule = await import("trash");

const { fileExists, confirm, exitWithMessage } = gitModule;
const trash = trashModule.default;

describe("handleExistingDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console mocks
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns early when directory does not exist", async () => {
    (fileExists as Mock).mockResolvedValue(false);

    await handleExistingDirectory("/test/path");

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).not.toHaveBeenCalled();
    expect(trash).not.toHaveBeenCalled();
  });

  it("exits cleanly when user declines to remove directory", async () => {
    (fileExists as Mock).mockResolvedValue(true);
    (confirm as Mock).mockResolvedValue(false);

    // Mock process.exit to throw an error to stop execution
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Process exit");
    });

    await expect(handleExistingDirectory("/test/path")).rejects.toThrow(
      "Process exit",
    );

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(console.log).toHaveBeenCalledWith("Operation cancelled.");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(trash).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("moves directory to trash when user confirms", async () => {
    (fileExists as Mock).mockResolvedValue(true);
    (confirm as Mock).mockResolvedValue(true);
    (trash as Mock).mockResolvedValue(void 0);

    await handleExistingDirectory("/test/path");

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(console.log).toHaveBeenCalledWith(
      "➤ Moving existing directory to trash...",
    );
    expect(trash).toHaveBeenCalledWith("/test/path");
    expect(console.log).toHaveBeenCalledWith(
      "✓ Directory moved to trash successfully",
    );
  });

  it("logs error details and exits when trash operation fails", async () => {
    (fileExists as Mock).mockResolvedValue(true);
    (confirm as Mock).mockResolvedValue(true);
    const trashError = new Error("Permission denied");
    (trash as Mock).mockRejectedValue(trashError);

    await handleExistingDirectory("/test/path");

    expect(fileExists).toHaveBeenCalledWith("/test/path");
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(trash).toHaveBeenCalledWith("/test/path");
    expect(console.error).toHaveBeenCalledWith("Error details:", trashError);
    expect(exitWithMessage).toHaveBeenCalledWith(
      "Failed to move existing directory to trash: Permission denied",
    );
  });

  it("handles non-Error exceptions from trash operation", async () => {
    (fileExists as Mock).mockResolvedValue(true);
    (confirm as Mock).mockResolvedValue(true);
    (trash as Mock).mockRejectedValue("String error");

    await handleExistingDirectory("/test/path");

    expect(console.error).toHaveBeenCalledWith(
      "Error details:",
      "String error",
    );
    expect(exitWithMessage).toHaveBeenCalledWith(
      "Failed to move existing directory to trash: String error",
    );
  });

  it("includes recovery hint in confirmation message", async () => {
    (fileExists as Mock).mockResolvedValue(true);
    (confirm as Mock).mockResolvedValue(false);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Process exit");
    });

    await expect(handleExistingDirectory("/test/my-worktree")).rejects.toThrow(
      "Process exit",
    );

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("You can restore it from your system trash"),
    );

    exitSpy.mockRestore();
  });
});
