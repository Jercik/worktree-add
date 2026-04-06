import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../git/git.js");

const gitModule = await import("../git/git.js");
const resolveWorktreeContextModule =
  await import("./resolve-worktree-context.js");

const {
  exitWithMessage,
  findWorktreeByBranchName,
  getCurrentWorktreeRoot,
  getRepositoryName,
  getSuperprojectRoot,
  normalizeBranchName,
  toSafePathSegment,
} = gitModule;
const { resolveWorktreeContext } = resolveWorktreeContextModule;

describe("resolveWorktreeContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exitWithMessage).mockImplementation((message: string): never => {
      throw new Error(message);
    });
    vi.mocked(findWorktreeByBranchName).mockImplementation(
      (): string | undefined => void 0,
    );
    vi.mocked(normalizeBranchName).mockImplementation((value: string) => value);
    vi.mocked(toSafePathSegment).mockImplementation((value: string) =>
      value.replaceAll("/", "-"),
    );
  });

  it("places submodule worktrees outside the superproject checkout", () => {
    vi.mocked(getCurrentWorktreeRoot).mockReturnValue(
      "/repos/parent/deps/child",
    );
    vi.mocked(getSuperprojectRoot).mockReturnValue("/repos/parent");
    vi.mocked(getRepositoryName).mockReturnValue("child");

    expect(resolveWorktreeContext("feature/login")).toEqual({
      branch: "feature/login",
      repoRoot: "/repos/parent/deps/child",
      destinationDirectory: "/repos/child-feature-login",
    });
  });

  it("keeps normal sibling placement outside submodules", () => {
    vi.mocked(getCurrentWorktreeRoot).mockReturnValue("/repos/child-feature");
    vi.mocked(getSuperprojectRoot).mockImplementation(
      (): string | undefined => void 0,
    );
    vi.mocked(getRepositoryName).mockReturnValue("child");

    expect(resolveWorktreeContext("feature/settings")).toEqual({
      branch: "feature/settings",
      repoRoot: "/repos/child-feature",
      destinationDirectory: "/repos/child-feature-settings",
    });
  });
});
