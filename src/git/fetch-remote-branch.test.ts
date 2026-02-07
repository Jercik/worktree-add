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
  normalizeBranchName,
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
    vi.mocked(normalizeBranchName).mockImplementation(
      (name: string): string => {
        return name;
      },
    );
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

  it("explains dry-run divergence limitation when local and remote branch both exist", () => {
    vi.mocked(localBranchExists).mockReturnValue(true);
    vi.mocked(remoteBranchExists).mockReturnValue(true);
    const logger = createLogger();

    expect(
      fetchRemoteBranch("codex/implement-new-transform-from-workflow.md", {
        dryRun: true,
        logger,
      }),
    ).toStrictEqual({
      status: "exists",
      localExists: true,
      divergence: undefined,
    });

    expect(logger.step).toHaveBeenCalledWith(
      "Would fetch origin/codex/implement-new-transform-from-workflow.md",
    );
    expect(logger.detail).toHaveBeenCalledWith(
      "Dry run does not check local/remote divergence because it skips fetch; a real run may stop with a divergence error.",
    );
    expect(fetchOriginBranch).not.toHaveBeenCalled();
  });
});
