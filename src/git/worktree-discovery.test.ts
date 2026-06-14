import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./git.js");

const gitModule = await import("./git.js");
const worktreeDiscoveryModule = await import("./worktree-discovery.js");

const { git } = gitModule;
const { findWorktreeByBranchName, getRepositoryName, getSuperprojectRoot } =
  worktreeDiscoveryModule;

const mainWorktreePath = "/repos/parent/deps/child";
const commonDirectory = "/repos/parent/.git/modules/deps/child";

interface RepositoryState {
  readonly toplevel: string;
  readonly commonDir?: string;
  readonly coreWorktree?: string;
  readonly worktreeList?: string;
  readonly superprojects?: Readonly<Record<string, string>>;
}

const mockGitRepository = (state: RepositoryState): void => {
  vi.mocked(git).mockImplementation((...arguments_) => {
    const command = arguments_[0];
    const subcommand = arguments_[1];
    const options = arguments_[2] as { cwd?: string } | undefined;

    if (command === "rev-parse" && subcommand === "--show-toplevel") {
      return state.toplevel;
    }
    if (
      command === "rev-parse" &&
      subcommand === "--git-common-dir" &&
      state.commonDir !== undefined
    ) {
      return state.commonDir;
    }
    if (command === "rev-parse" && subcommand === "--show-superproject-working-tree") {
      const superproject = state.superprojects?.[options?.cwd ?? ""];
      if (superproject !== undefined) {
        return superproject;
      }
    }
    if (command === "config" && state.coreWorktree !== undefined) {
      return state.coreWorktree;
    }
    if (command === "worktree" && subcommand === "list" && state.worktreeList !== undefined) {
      return state.worktreeList;
    }

    throw new Error(`Unexpected git arguments: ${JSON.stringify(arguments_)}`);
  });
};

const submoduleRepository: RepositoryState = {
  toplevel: mainWorktreePath,
  commonDir: commonDirectory,
  coreWorktree: "../../../../deps/child",
};

const unsetCoreWorktreeRepository: RepositoryState = {
  toplevel: "/repos/worktree-add-feature-login",
  commonDir: "/repos/worktree-add/.git",
  coreWorktree: "",
  worktreeList: `worktree /repos/worktree-add
HEAD 0123456789abcdef
branch refs/heads/main

worktree /repos/worktree-add-feature-login
HEAD fedcba9876543210
branch refs/heads/feature/login`,
};

describe("worktree discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gets the repository name from the visible main worktree path", () => {
    mockGitRepository(submoduleRepository);

    expect(getRepositoryName()).toBe("child");
  });

  it("maps the primary submodule worktree entry back to the visible path", () => {
    mockGitRepository({
      ...submoduleRepository,
      worktreeList: `worktree ${commonDirectory}
HEAD 0123456789abcdef
branch refs/heads/main

worktree /repos/child-feature-login
HEAD fedcba9876543210
branch refs/heads/feature/login`,
    });

    expect(findWorktreeByBranchName("main")).toBe(mainWorktreePath);
    expect(findWorktreeByBranchName("feature/login")).toBe("/repos/child-feature-login");
  });

  it("gets the repository name from the primary worktree when core.worktree is unset", () => {
    mockGitRepository(unsetCoreWorktreeRepository);

    expect(getRepositoryName()).toBe("worktree-add");
  });

  it("maps the primary worktree entry when core.worktree is unset", () => {
    mockGitRepository(unsetCoreWorktreeRepository);

    expect(findWorktreeByBranchName("feature/login")).toBe("/repos/worktree-add-feature-login");
  });

  it("returns the top-most superproject for nested submodules", () => {
    mockGitRepository({
      toplevel: "/repos/outer/deps/middle/deps/inner",
      superprojects: {
        "/repos/outer/deps/middle/deps/inner": "/repos/outer/deps/middle",
        "/repos/outer/deps/middle": "/repos/outer",
        "/repos/outer": "",
      },
    });

    expect(getSuperprojectRoot()).toBe("/repos/outer");
  });

  it("throws when nested superproject traversal exceeds the safety limit", () => {
    mockGitRepository({
      toplevel: "/repos/inner",
      superprojects: {
        "/repos/inner": "/repos/loop",
        "/repos/loop": "/repos/loop",
      },
    });

    expect(() => getSuperprojectRoot()).toThrow(
      "Expected at most 10 nested superprojects while resolving the topmost superproject",
    );
  });
});
