import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusLogger } from "../output/create-status-logger.js";

vi.mock("./git.js");

const gitModule = await import("./git.js");
const createWorktreeModule = await import("./create-worktree.js");

const { git, normalizeBranchName } = gitModule;
const { createWorktree } = createWorktreeModule;

const noop = (message: string): void => {
  void message;
};

const createLogger = (): StatusLogger => ({
  step: vi.fn(noop),
  success: vi.fn(noop),
  detail: vi.fn(noop),
  warn: vi.fn(noop),
});

describe("createWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(git).mockReturnValue("");
    vi.mocked(normalizeBranchName).mockImplementation((value: string) => value);
  });

  it("renders the local-branch dry-run command without executing git", async () => {
    const logger = createLogger();

    await createWorktree("feature/a", "/repo-a", {
      sourceRoot: "/repo",
      onCreated: vi.fn<() => void>(),
      source: { kind: "local", fastForward: undefined },
      dryRun: true,
      logger,
    });

    expect(logger.step).toHaveBeenCalledWith("Would run git worktree add -- /repo-a feature/a");
    expect(git).not.toHaveBeenCalled();
  });

  it("executes the remote-branch worktree argv", async () => {
    const logger = createLogger();

    await createWorktree("feature/a", "/repo-a", {
      sourceRoot: "/repo",
      onCreated: vi.fn<() => void>(),
      source: { kind: "origin" },
      logger,
    });

    expect(git).toHaveBeenCalledWith(
      "worktree",
      "add",
      "--track",
      "-b",
      "feature/a",
      "--",
      "/repo-a",
      "origin/feature/a",
    );
  });
});
