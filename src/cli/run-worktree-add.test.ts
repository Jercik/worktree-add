import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../app/resolve-apps.js", () => ({ resolveApps: vi.fn(() => []) }));
vi.mock("../git/create-worktree.js", () => ({ createWorktree: vi.fn() }));
vi.mock("../git/fetch-remote-branch.js", () => ({
  fetchRemoteBranch: vi.fn(() => ({ localExists: false, status: "missing" })),
}));
vi.mock("../git/git.js", () => ({ exitWithMessage: vi.fn() }));
vi.mock("../project/setup.js", () => ({ setupProject: vi.fn() }));
vi.mock("../worktree/destination-directory.js", () => ({
  handleExistingDirectory: vi.fn(() => ({
    destinationWillBeReplaced: false,
    shouldContinue: true,
  })),
}));
vi.mock("../worktree/copy-local-files.js", () => ({
  copyLocalFiles: vi.fn(),
}));
vi.mock("../worktree/local-file-paths.js", () => ({
  parseCopyFileNames: vi.fn((fileNames: string[]) => fileNames),
}));
vi.mock("../worktree/preflight-local-files.js", () => ({
  closePreflightedLocalFiles: vi.fn(),
  closePreflightedLocalFilesAfterError: vi.fn(),
  preflightLocalFiles: vi.fn(() => []),
}));
vi.mock("./cleanup-worktree.js", () => ({ cleanupWorktree: vi.fn() }));
vi.mock("./open-worktree-apps.js", () => ({ openWorktreeApps: vi.fn() }));
vi.mock("./register-sigint-handler.js", () => ({ registerSigintHandler: vi.fn(() => vi.fn()) }));
vi.mock("./resolve-worktree-context.js", () => ({
  resolveWorktreeContext: vi.fn(() => ({
    branch: "feature/local-config",
    destinationDirectory: "/repo-local-config",
    repoRoot: "/repo",
  })),
}));

const copyLocalFilesModule = await import("../worktree/copy-local-files.js");
const localFilePathsModule = await import("../worktree/local-file-paths.js");
const preflightLocalFilesModule = await import("../worktree/preflight-local-files.js");
const setupProjectModule = await import("../project/setup.js");
const destinationDirectoryModule = await import("../worktree/destination-directory.js");
const registerSigintHandlerModule = await import("./register-sigint-handler.js");
const { runWorktreeAdd } = await import("./run-worktree-add.js");
const closePreflightedLocalFilesAfterError = vi.mocked(
  preflightLocalFilesModule.closePreflightedLocalFilesAfterError,
);
const copyLocalFiles = vi.mocked(copyLocalFilesModule.copyLocalFiles);
const preflightLocalFiles = vi.mocked(preflightLocalFilesModule.preflightLocalFiles);
const setupProject = vi.mocked(setupProjectModule.setupProject);
const parseCopyFileNames = vi.mocked(localFilePathsModule.parseCopyFileNames);
const handleExistingDirectory = vi.mocked(destinationDirectoryModule.handleExistingDirectory);
const registerSigintHandler = vi.mocked(registerSigintHandlerModule.registerSigintHandler);

describe("runWorktreeAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies explicit local files after project setup", async () => {
    await runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] });

    expect(preflightLocalFiles.mock.calls.at(0)?.[0]).toBe("/repo");
    expect(preflightLocalFiles.mock.calls.at(0)?.[1]).toStrictEqual([".env.local"]);
    expect(preflightLocalFiles).toHaveBeenCalledBefore(handleExistingDirectory);
    expect(setupProject).toHaveBeenCalledBefore(copyLocalFiles);
    expect(copyLocalFiles).toHaveBeenCalledWith(
      "/repo-local-config",
      [],
      expect.objectContaining({ destinationWillBeReplaced: false, dryRun: false }),
    );
  });

  it("stops before destination handling when local file preflight fails", async () => {
    preflightLocalFiles.mockRejectedValueOnce(new Error("local file is invalid"));

    await expect(
      runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] }),
    ).rejects.toThrow("local file is invalid");

    expect(handleExistingDirectory).not.toHaveBeenCalled();
  });

  it("rejects nested copy-file input before preflight and destination handling", async () => {
    parseCopyFileNames.mockImplementationOnce(() => {
      throw new Error("nested local files are not allowed");
    });

    await expect(
      runWorktreeAdd("feature/local-config", { copyFile: ["config/local.json"] }),
    ).rejects.toThrow("nested local files are not allowed");

    expect(preflightLocalFiles).not.toHaveBeenCalled();
    expect(handleExistingDirectory).not.toHaveBeenCalled();
  });

  it("closes preflighted local files when setup fails before copying", async () => {
    setupProject.mockRejectedValueOnce(new Error("setup failed"));

    await expect(
      runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] }),
    ).rejects.toThrow("setup failed");

    expect(closePreflightedLocalFilesAfterError).toHaveBeenCalledWith([], expect.any(Object));
  });

  it("closes preflighted local files when signal handler registration fails", async () => {
    registerSigintHandler.mockImplementationOnce(() => {
      throw new Error("signal handler failed");
    });

    await expect(
      runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] }),
    ).rejects.toThrow("signal handler failed");

    expect(closePreflightedLocalFilesAfterError).toHaveBeenCalledWith([], expect.any(Object));
  });
});
