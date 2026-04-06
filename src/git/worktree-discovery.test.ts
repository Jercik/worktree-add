import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./git.js");

const gitModule = await import("./git.js");
const worktreeDiscoveryModule = await import("./worktree-discovery.js");

const { git } = gitModule;
const { findWorktreeByBranchName, getRepositoryName, getSuperprojectRoot } =
  worktreeDiscoveryModule;

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

  it("gets the repository name from the primary worktree when core.worktree is unset", () => {
    vi.mocked(git).mockImplementation((...arguments_) => {
      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-toplevel"
      ) {
        return "/repos/worktree-add-feature-login";
      }

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--git-common-dir"
      ) {
        return "/repos/worktree-add/.git";
      }

      if (arguments_[0] === "config") {
        return "";
      }

      if (arguments_[0] === "worktree" && arguments_[1] === "list") {
        return `worktree /repos/worktree-add
HEAD 0123456789abcdef
branch refs/heads/main

worktree /repos/worktree-add-feature-login
HEAD fedcba9876543210
branch refs/heads/feature/login`;
      }

      throw new Error(
        `Unexpected git arguments: ${JSON.stringify(arguments_)}`,
      );
    });

    expect(getRepositoryName()).toBe("worktree-add");
  });

  it("returns the top-most superproject for nested submodules", () => {
    vi.mocked(git).mockImplementation((...arguments_) => {
      const options = arguments_[2] as { cwd?: string } | undefined;

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-toplevel"
      ) {
        return "/repos/outer/deps/middle/deps/inner";
      }

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-superproject-working-tree" &&
        options?.cwd === "/repos/outer/deps/middle/deps/inner"
      ) {
        return "/repos/outer/deps/middle";
      }

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-superproject-working-tree" &&
        options?.cwd === "/repos/outer/deps/middle"
      ) {
        return "/repos/outer";
      }

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-superproject-working-tree" &&
        options?.cwd === "/repos/outer"
      ) {
        return "";
      }

      throw new Error(
        `Unexpected git arguments: ${JSON.stringify(arguments_)}`,
      );
    });

    expect(getSuperprojectRoot()).toBe("/repos/outer");
  });

  it("throws when nested superproject traversal exceeds the safety limit", () => {
    vi.mocked(git).mockImplementation((...arguments_) => {
      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-toplevel"
      ) {
        return "/repos/inner";
      }

      if (
        arguments_[0] === "rev-parse" &&
        arguments_[1] === "--show-superproject-working-tree"
      ) {
        return "/repos/loop";
      }

      throw new Error(
        `Unexpected git arguments: ${JSON.stringify(arguments_)}`,
      );
    });

    expect(() => getSuperprojectRoot()).toThrow(
      "Expected at most 10 nested superprojects while resolving the topmost superproject",
    );
  });
});
