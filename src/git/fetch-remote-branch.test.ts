import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRemoteBranch } from "./fetch-remote-branch.js";
import type { StatusLogger } from "../output/create-status-logger.js";

vi.mock("./git.js");

const gitModule = await import("./git.js");
const {
  fetchOriginBranch,
  getAheadBehindCounts,
  getLocalBranchHead,
  getRemoteBranchHead,
  git,
  localBranchExists,
  remoteBranchExists,
} = gitModule;

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

describe("fetchRemoteBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns diverged status when local and origin branch histories diverge", () => {
    vi.mocked(localBranchExists).mockReturnValue(true);
    vi.mocked(remoteBranchExists).mockReturnValue(true);
    vi.mocked(fetchOriginBranch).mockImplementation(() => {});
    vi.mocked(getLocalBranchHead).mockReturnValue("local-head");
    vi.mocked(getRemoteBranchHead).mockReturnValue("remote-head");
    vi.mocked(getAheadBehindCounts).mockReturnValue({ ahead: 15, behind: 1 });
    const logger = createLogger();

    expect(
      fetchRemoteBranch("codex/implement-new-transform-from-workflow.md", {
        logger,
      }),
    ).toStrictEqual({
      status: "diverged",
      localExists: true,
      divergence: { ahead: 15, behind: 1 },
    });

    expect(git).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
