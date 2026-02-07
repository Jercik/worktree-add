import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWorktreeAdd } from "./run-worktree-add.js";
import type { StatusLogger } from "../output/create-status-logger.js";

vi.mock("../output/create-status-logger.js");
vi.mock("../app/resolve-apps.js");
vi.mock("../worktree/destination-directory.js");
vi.mock("../worktree/untracked-file-copy.js");
vi.mock("../project/setup.js");
vi.mock("../git/git.js");
vi.mock("../git/create-worktree.js");
vi.mock("../git/fetch-remote-branch.js");
vi.mock("./cleanup-worktree.js");
vi.mock("./open-worktree-apps.js");
vi.mock("./register-sigint-handler.js");
vi.mock("./resolve-worktree-context.js");

const outputModule = await import("../output/create-status-logger.js");
const appModule = await import("../app/resolve-apps.js");
const destinationDirectoryModule =
  await import("../worktree/destination-directory.js");
const untrackedFileCopyModule =
  await import("../worktree/untracked-file-copy.js");
const setupModule = await import("../project/setup.js");
const gitModule = await import("../git/git.js");
const createWorktreeModule = await import("../git/create-worktree.js");
const fetchRemoteBranchModule = await import("../git/fetch-remote-branch.js");
const cleanupWorktreeModule = await import("./cleanup-worktree.js");
const openWorktreeAppsModule = await import("./open-worktree-apps.js");
const registerSigintHandlerModule =
  await import("./register-sigint-handler.js");
const resolveWorktreeContextModule =
  await import("./resolve-worktree-context.js");

const { createStatusLogger } = outputModule;
const { resolveApps } = appModule;
const { handleExistingDirectory } = destinationDirectoryModule;
const { copyUntrackedFiles } = untrackedFileCopyModule;
const { setupProject } = setupModule;
const { exitWithMessage } = gitModule;
const { createWorktree } = createWorktreeModule;
const { fetchRemoteBranch } = fetchRemoteBranchModule;
const { cleanupWorktree } = cleanupWorktreeModule;
const { openWorktreeApps } = openWorktreeAppsModule;
const { registerSigintHandler } = registerSigintHandlerModule;
const { resolveWorktreeContext } = resolveWorktreeContextModule;

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

describe("runWorktreeAdd", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createStatusLogger).mockReturnValue(createLogger());
    vi.mocked(resolveApps).mockReturnValue([]);
    vi.mocked(handleExistingDirectory).mockResolvedValue(true);
    vi.mocked(copyUntrackedFiles).mockResolvedValue(void 0);
    vi.mocked(setupProject).mockResolvedValue(void 0);
    vi.mocked(fetchRemoteBranch).mockReturnValue({
      status: "diverged",
      localExists: true,
      divergence: { ahead: 15, behind: 1 },
    });
    vi.mocked(resolveWorktreeContext).mockReturnValue({
      branch: "codex/implement-new-transform-from-workflow.md",
      repoRoot: "/tmp/repo",
      destinationDirectory:
        "/tmp/repo-codex-implement-new-transform-from-workflow.md",
    });
    vi.mocked(registerSigintHandler).mockReturnValue((): void => {});
    vi.mocked(exitWithMessage).mockImplementation((message: string): never => {
      throw new Error(message);
    });
  });

  it("fails with recovery commands when local and origin branches diverge", async () => {
    await expect(
      runWorktreeAdd("codex/implement-new-transform-from-workflow.md", {}),
    ).rejects.toThrowError(
      "Local branch 'codex/implement-new-transform-from-workflow.md' and origin/codex/implement-new-transform-from-workflow.md have diverged (ahead by 15 and behind by 1).",
    );

    expect(exitWithMessage).toHaveBeenCalledWith(
      expect.stringContaining("git fetch origin --prune"),
    );
    expect(exitWithMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        "git branch -m -- 'codex/implement-new-transform-from-workflow.md' 'codex/implement-new-transform-from-workflow.md-old'",
      ),
    );
    expect(exitWithMessage).toHaveBeenCalledWith(
      expect.stringContaining(
        "worktree-add -- 'codex/implement-new-transform-from-workflow.md'",
      ),
    );
    expect(createWorktree).not.toHaveBeenCalled();
    expect(copyUntrackedFiles).not.toHaveBeenCalled();
    expect(setupProject).not.toHaveBeenCalled();
    expect(openWorktreeApps).not.toHaveBeenCalled();
    expect(cleanupWorktree).not.toHaveBeenCalled();
  });
});
