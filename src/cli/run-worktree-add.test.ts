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
    assumeDestinationEmpty: false,
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
const cleanupWorktreeModule = await import("./cleanup-worktree.js");
const { runWorktreeAdd } = await import("./run-worktree-add.js");
const closePreflightedLocalFiles = vi.mocked(preflightLocalFilesModule.closePreflightedLocalFiles);
const copyLocalFiles = vi.mocked(copyLocalFilesModule.copyLocalFiles);
const cleanupWorktree = vi.mocked(cleanupWorktreeModule.cleanupWorktree);
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

    expect(preflightLocalFiles).toHaveBeenCalledWith("/repo", [".env.local"], expect.any(Object));
    expect(preflightLocalFiles).toHaveBeenCalledBefore(handleExistingDirectory);
    expect(setupProject).toHaveBeenCalledBefore(copyLocalFiles);
    expect(copyLocalFiles).toHaveBeenCalledWith(
      "/repo-local-config",
      [],
      expect.objectContaining({ assumeDestinationEmpty: false, dryRun: false }),
    );
    expect(closePreflightedLocalFiles).toHaveBeenCalledWith([], expect.any(Object));
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

    expect(cleanupWorktree).toHaveBeenCalledWith(
      "/repo-local-config",
      expect.any(Object),
      "due to failure",
    );
    expect(closePreflightedLocalFiles).toHaveBeenCalledWith([], expect.any(Object));
  });

  it("closes preflighted local files when signal handler registration fails", async () => {
    registerSigintHandler.mockImplementationOnce(() => {
      throw new Error("signal handler failed");
    });

    await expect(
      runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] }),
    ).rejects.toThrow("signal handler failed");

    expect(closePreflightedLocalFiles).toHaveBeenCalledWith([], expect.any(Object));
  });

  it("keeps a successfully installed worktree when source-handle cleanup warns", async () => {
    closePreflightedLocalFiles.mockImplementationOnce((_localFiles, logger) => {
      if (logger === undefined) {
        throw new Error("Expected a status logger.");
      }
      logger.warn("Failed to close a local copy source file: EIO close");
      return Promise.resolve();
    });

    await expect(
      runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] }),
    ).resolves.toBeUndefined();

    expect(copyLocalFiles).toHaveBeenCalledWith("/repo-local-config", [], expect.any(Object));
    expect(cleanupWorktree).not.toHaveBeenCalled();
  });

  it.each(["ENOSPC", "EACCES", "EROFS"])(
    "reports %s from post-setup copy without removing the installed worktree",
    async (code) => {
      copyLocalFiles.mockRejectedValueOnce(Object.assign(new Error(code), { code }));

      await expect(
        runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] }),
      ).rejects.toMatchObject({ code });

      expect(setupProject).toHaveBeenCalledWith("/repo-local-config", expect.any(Object));
      expect(cleanupWorktree).not.toHaveBeenCalled();
      expect(closePreflightedLocalFiles).toHaveBeenCalledWith([], expect.any(Object));
    },
  );

  it("keeps a completed worktree when interrupted after setup", async () => {
    let onCleanup: (() => "kept" | "removed" | Promise<"kept" | "removed">) | undefined;
    registerSigintHandler.mockImplementationOnce((options) => {
      onCleanup = options.onCleanup;
      return () => {};
    });

    await runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] });

    await onCleanup?.();

    expect(cleanupWorktree).not.toHaveBeenCalled();
  });

  it("removes an incomplete worktree when interrupted before setup completes", async () => {
    let onCleanup: (() => "kept" | "removed" | Promise<"kept" | "removed">) | undefined;
    let resolveSetup: (() => void) | undefined;
    registerSigintHandler.mockImplementationOnce((options) => {
      onCleanup = options.onCleanup;
      return () => {};
    });
    setupProject.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSetup = resolve;
        }),
    );

    const run = runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] });
    await vi.waitFor(() => {
      expect(onCleanup).toBeTypeOf("function");
    });
    await onCleanup?.();
    resolveSetup?.();
    await run;

    expect(cleanupWorktree).toHaveBeenCalledWith(
      "/repo-local-config",
      expect.any(Object),
      "after interruption",
    );
  });

  it("aborts an in-progress copy before completing SIGINT cleanup", async () => {
    let onCleanup: (() => "kept" | "removed" | Promise<"kept" | "removed">) | undefined;
    let copySignal: AbortSignal | undefined;
    registerSigintHandler.mockImplementationOnce((options) => {
      onCleanup = options.onCleanup;
      return () => {};
    });
    copyLocalFiles.mockImplementationOnce(
      (_destinationDirectory, _localFiles, options) =>
        new Promise<void>((_resolve, reject) => {
          copySignal = options?.signal;
          copySignal?.addEventListener("abort", () => {
            reject(new Error("copy aborted"));
          });
        }),
    );

    const run = runWorktreeAdd("feature/local-config", { copyFile: [".env.local"] });
    await vi.waitFor(() => {
      expect(copySignal).toBeDefined();
    });
    await onCleanup?.();

    expect(copySignal?.aborted).toBe(true);
    await expect(run).rejects.toThrow("copy aborted");
    expect(cleanupWorktree).not.toHaveBeenCalled();
  });
});
