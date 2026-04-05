import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./git.js");

const gitModule = await import("./git.js");
const worktreeDiscoveryModule = await import("./worktree-discovery.js");

const { git } = gitModule;
const { findWorktreeByBranchName, getRepositoryName } = worktreeDiscoveryModule;

const mainWorktreePath = "/repos/parent/deps/child";
const commonDirectory = "/repos/parent/.git/modules/deps/child";

describe("worktree discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets the repository name from the visible main worktree path", () => {
    vi.mocked(git).mockImplementation((...arguments_) => {
      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-toplevel"
      ) {
        return mainWorktreePath;
      }

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--git-common-dir"
      ) {
        return commonDirectory;
      }

      if (arguments_[0] === "config") {
        return "../../../../deps/child";
      }

      throw new Error(
        `Unexpected git arguments: ${JSON.stringify(arguments_)}`,
      );
    });

    expect(getRepositoryName()).toBe("child");
  });

  it("maps the primary submodule worktree entry back to the visible path", () => {
    vi.mocked(git).mockImplementation((...arguments_) => {
      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-toplevel"
      ) {
        return mainWorktreePath;
      }

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--git-common-dir"
      ) {
        return commonDirectory;
      }

      if (arguments_[0] === "config") {
        return "../../../../deps/child";
      }

      if (arguments_[0] === "worktree" && arguments_[1] === "list") {
        return `worktree ${commonDirectory}
HEAD 0123456789abcdef
branch refs/heads/main

worktree /repos/child-feature-login
HEAD fedcba9876543210
branch refs/heads/feature/login`;
      }

      throw new Error(
        `Unexpected git arguments: ${JSON.stringify(arguments_)}`,
      );
    });

    expect(findWorktreeByBranchName("main")).toBe(mainWorktreePath);
    expect(findWorktreeByBranchName("feature/login")).toBe(
      "/repos/child-feature-login",
    );
  });
});
