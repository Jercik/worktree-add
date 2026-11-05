import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchRemoteBranch } from "./fetch-remote-branch.js";
import type { StatusLogger } from "../output/create-status-logger.js";

vi.mock("./git.js");

const gitModule = await import("./git.js");
const { fetchOriginBranch, localBranchExists, normalizeBranchName, remoteBranchExists } = gitModule;

const createLogger = (): StatusLogger => ({
  step: vi.fn<StatusLogger["step"]>(),
  success: vi.fn<StatusLogger["success"]>(),
  detail: vi.fn<StatusLogger["detail"]>(),
  warn: vi.fn<StatusLogger["warn"]>(),
});

describe("fetchRemoteBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(normalizeBranchName).mockImplementation((name: string): string => name);
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
