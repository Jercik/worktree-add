import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { git } from "../git/git.js";
import { findTooOldGitForUnbornHead } from "../git/unborn-head-support.js";

vi.mock("../project/setup.js");
vi.mock("trash");
vi.mock("../worktree/untracked-file-copy.js", { spy: true });

const { default: trash } = await import("trash");
const { copyUntrackedFiles } = await import("../worktree/untracked-file-copy.js");
const { setupProject } = await import("../project/setup.js");
const { runWorktreeAdd } = await import("./run-worktree-add.js");

const originalDirectory = process.cwd();
const temporaryDirectories: string[] = [];

const commit = (cwd: string, message: string): void => {
  git("commit", "--quiet", "--allow-empty", "--message", message, { cwd });
};

async function createRepository(options: {
  withCommit: boolean;
}): Promise<{ sandbox: string; repoRoot: string }> {
  const sandbox = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "worktree-add-run-test-")),
  );
  temporaryDirectories.push(sandbox);
  const repoRoot = path.join(sandbox, "app");
  git("init", "--quiet", "--bare", "origin.git", { cwd: sandbox });
  // Loose refs let a test hold a ref lock to make a branch deletion fail.
  git("init", "--quiet", "--initial-branch=main", "app", {
    cwd: sandbox,
  });
  git("remote", "add", "origin", path.join(sandbox, "origin.git"), { cwd: repoRoot });
  if (options.withCommit) {
    commit(repoRoot, "initial");
    git("push", "--quiet", "origin", "main", { cwd: repoRoot });
  }
  process.chdir(repoRoot);
  return { sandbox, repoRoot };
}

const listLocalBranches = (repoRoot: string): string =>
  git("for-each-ref", "--format=%(refname:short)", "refs/heads", { cwd: repoRoot });

const pushNewerMain = (repoRoot: string, count: number): void => {
  let tip = "main";
  for (let index = 0; index < count; index += 1) {
    tip = git("commit-tree", "-p", tip, "-m", `newer ${index}`, "main^{tree}", {
      cwd: repoRoot,
    });
  }
  git("push", "--quiet", "origin", `${tip}:refs/heads/main`, { cwd: repoRoot });
  // Drop the pushed objects so the repository only learns about them by fetching.
  git("reflog", "expire", "--expire=now", "--all", { cwd: repoRoot });
  git("update-ref", "-d", "refs/remotes/origin/main", { cwd: repoRoot });
  git("gc", "--quiet", "--prune=now", { cwd: repoRoot });
};

beforeEach(() => {
  // Keep the machine's git config (identity, signing, hooksPath) out of the scratch repos.
  vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_AUTHOR_NAME", "Test");
  vi.stubEnv("GIT_AUTHOR_EMAIL", "test@example.com");
  vi.stubEnv("GIT_COMMITTER_NAME", "Test");
  vi.stubEnv("GIT_COMMITTER_EMAIL", "test@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(setupProject).mockReset().mockRejectedValue(new Error("install failed"));
});

afterEach(async () => {
  process.chdir(originalDirectory);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("runWorktreeAdd cleanup after a setup failure", () => {
  it("removes the worktree and the branch it created from HEAD", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow("install failed");

    await expect(fs.lstat(path.join(sandbox, "app-feature-new"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(listLocalBranches(repoRoot)).toBe("main");
  });

  it("deletes the local tracking branch it created from origin, with its config", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("push", "--quiet", "origin", "main:refs/heads/feature/remote", { cwd: repoRoot });

    await expect(runWorktreeAdd("feature/remote", {})).rejects.toThrow("install failed");

    expect(listLocalBranches(repoRoot)).toBe("main");
    expect(
      git("config", "--local", "--default", "none", "--get", "branch.feature/remote.merge", {
        cwd: repoRoot,
      }),
    ).toBe("none");
  });

  it("keeps branch config that predates the run and drops the tracking config it added", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("push", "--quiet", "origin", "main:refs/heads/feature/remote", { cwd: repoRoot });
    git("config", "--local", "branch.feature/remote.description", "user note", { cwd: repoRoot });

    await expect(runWorktreeAdd("feature/remote", {})).rejects.toThrow("install failed");

    expect(listLocalBranches(repoRoot)).toBe("main");
    expect(
      git("config", "--local", "--get-regexp", String.raw`^branch\.feature/remote\.`, {
        cwd: repoRoot,
      }),
    ).toBe("branch.feature/remote.description user note");
  });

  it("restores tracking config values that predate the run", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("push", "--quiet", "origin", "main:refs/heads/feature/remote", { cwd: repoRoot });
    git("config", "--local", "branch.feature/remote.remote", "upstream", { cwd: repoRoot });
    git("config", "--local", "branch.feature/remote.merge", "refs/heads/other", { cwd: repoRoot });

    await expect(runWorktreeAdd("feature/remote", {})).rejects.toThrow("install failed");

    expect(listLocalBranches(repoRoot)).toBe("main");
    expect(
      git("config", "--local", "--get-regexp", String.raw`^branch\.feature/remote\.`, {
        cwd: repoRoot,
      }),
    ).toBe("branch.feature/remote.remote upstream\nbranch.feature/remote.merge refs/heads/other");
  });

  it("reports the pre-run config when restoring it fails after the branch is deleted", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("push", "--quiet", "origin", "main:refs/heads/feature/remote", { cwd: repoRoot });
    git("config", "--local", "branch.feature/remote.description", "user note", { cwd: repoRoot });
    vi.mocked(setupProject).mockImplementationOnce(async () => {
      await fs.writeFile(path.join(repoRoot, ".git", "config.lock"), "");
      throw new Error("install failed");
    });

    await expect(runWorktreeAdd("feature/remote", {})).rejects.toThrow("install failed");

    expect(listLocalBranches(repoRoot)).toBe("main");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Deleted branch 'feature/remote'"),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `Its values before this run: {"branch.feature/remote.description":["user note"]}`,
      ),
    );
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete branch"),
    );
  });

  it("keeps a local branch that existed before the run", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("branch", "feature/existing", { cwd: repoRoot });

    await expect(runWorktreeAdd("feature/existing", {})).rejects.toThrow("install failed");

    expect(listLocalBranches(repoRoot)).toBe("feature/existing\nmain");
  });

  it("checks out a local branch that existed before the run instead of detaching", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("branch", "feature/existing", { cwd: repoRoot });
    let checkedOut: string | undefined;
    vi.mocked(setupProject).mockImplementationOnce((destinationDirectory) => {
      checkedOut = git("symbolic-ref", "HEAD", { cwd: destinationDirectory });
      return Promise.reject(new Error("install failed"));
    });

    await expect(runWorktreeAdd("feature/existing", {})).rejects.toThrow("install failed");

    expect(checkedOut).toBe("refs/heads/feature/existing");
  });

  it("keeps a pre-existing local branch that the run fast-forwarded", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("branch", "feature/behind", { cwd: repoRoot });
    const ahead = git("commit-tree", "-p", "main", "-m", "ahead", "main^{tree}", {
      cwd: repoRoot,
    });
    git("push", "--quiet", "origin", `${ahead}:refs/heads/feature/behind`, { cwd: repoRoot });

    await expect(runWorktreeAdd("feature/behind", {})).rejects.toThrow("install failed");

    expect(listLocalBranches(repoRoot)).toBe("feature/behind\nmain");
    expect(git("log", "-1", "--format=%s", "feature/behind", { cwd: repoRoot })).toBe("ahead");
  });

  it("keeps a created branch that gained commits before the failure", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    vi.mocked(setupProject).mockImplementationOnce((destinationDirectory) => {
      commit(destinationDirectory, "work in progress");
      return Promise.reject(new Error("install failed"));
    });

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow("install failed");

    expect(listLocalBranches(repoRoot)).toBe("feature/new\nmain");
    expect(git("log", "-1", "--format=%s", "feature/new", { cwd: repoRoot })).toBe(
      "work in progress",
    );
  });

  it.skipIf(process.platform === "win32")(
    "keeps a created branch that a post-checkout hook committed to",
    async () => {
      const { repoRoot } = await createRepository({ withCommit: true });
      await fs.writeFile(
        path.join(repoRoot, ".git", "hooks", "post-checkout"),
        '#!/bin/sh\n[ "$3" = 1 ] && git commit --quiet --allow-empty --message "hook commit"\nexit 0\n',
        { mode: 0o755 },
      );

      await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow("install failed");

      expect(listLocalBranches(repoRoot)).toBe("feature/new\nmain");
      expect(git("log", "-1", "--format=%s", "feature/new", { cwd: repoRoot })).toBe("hook commit");
    },
  );

  it("keeps a created branch that another worktree has checked out", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    vi.mocked(setupProject).mockImplementationOnce(() => {
      git("worktree", "add", "--force", "--quiet", "../elsewhere", "feature/new", {
        cwd: repoRoot,
      });
      return Promise.reject(new Error("install failed"));
    });

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow("install failed");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Keeping branch 'feature/new' because it is checked out at"),
    );
    expect(listLocalBranches(repoRoot)).toBe("feature/new\nmain");
  });

  it("leaves the config of a branch whose name extends the deleted one", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("branch", "--quiet", "--track", "feature/new.x", "main", { cwd: repoRoot });

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow("install failed");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Deleted branch 'feature/new'"),
    );
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete branch"),
    );
    expect(listLocalBranches(repoRoot)).toBe("feature/new.x\nmain");
    expect(git("config", "--local", "--get", "branch.feature/new.x.merge", { cwd: repoRoot })).toBe(
      "refs/heads/main",
    );
  });

  it("reports a failed branch deletion and still surfaces the original error", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    vi.mocked(setupProject).mockImplementationOnce(async () => {
      await fs.writeFile(path.join(repoRoot, ".git", "refs", "heads", "feature", "new.lock"), "");
      throw new Error("install failed");
    });

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow("install failed");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete branch 'feature/new'"),
    );
    expect(listLocalBranches(repoRoot)).toBe("feature/new\nmain");
  });

  it("leaves the branches alone on a dry run", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });

    await expect(runWorktreeAdd("feature/new", { dryRun: true })).rejects.toThrow("install failed");

    await expect(fs.lstat(path.join(sandbox, "app-feature-new"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(listLocalBranches(repoRoot)).toBe("main");
  });

  it("removes the worktree in a repository with no commits yet", async () => {
    const { sandbox } = await createRepository({ withCommit: false });
    // The assertion follows the installed git: older releases refuse before touching anything.
    const expectedError =
      findTooOldGitForUnbornHead() === undefined
        ? "install failed"
        : "Creating a worktree in a repository with no commits needs git 2.42 or newer";

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow(expectedError);

    await expect(fs.lstat(path.join(sandbox, "app-feature-new"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("runWorktreeAdd in a repository with no commits yet", () => {
  it("creates the worktree", async () => {
    const { sandbox } = await createRepository({ withCommit: false });
    vi.mocked(setupProject).mockResolvedValueOnce();
    // The expected outcome follows the installed git: older releases refuse before creating anything.
    const oldGitVersion = findTooOldGitForUnbornHead();
    const worktreeDirectory = path.join(sandbox, "app-feature-new");

    const outcome = await runWorktreeAdd("feature/new", {}).then(
      () => "created",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );

    expect(outcome).toBe(
      oldGitVersion === undefined
        ? "created"
        : `Creating a worktree in a repository with no commits needs git 2.42 or newer (found ${oldGitVersion}).`,
    );
    const worktreeBranch = await fs.lstat(worktreeDirectory).then(
      () => git("symbolic-ref", "--short", "HEAD", { cwd: worktreeDirectory }),
      () => "no worktree",
    );
    expect(worktreeBranch).toBe(oldGitVersion === undefined ? "feature/new" : "no worktree");
  });
});

describe("runWorktreeAdd when the current branch is behind origin", () => {
  it("refuses to create a new branch from the outdated HEAD", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });
    pushNewerMain(repoRoot, 2);

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow(
      "Local 'main' is 2 commits behind origin/main.\nRefusing to create 'feature/new' from an outdated HEAD.",
    );

    await expect(fs.lstat(path.join(sandbox, "app-feature-new"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(listLocalBranches(repoRoot)).toBe("main");
  });

  it("refuses before moving an existing destination to trash", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });
    pushNewerMain(repoRoot, 1);
    await fs.mkdir(path.join(sandbox, "app-feature-new"));

    await expect(runWorktreeAdd("feature/new", { yes: true })).rejects.toThrow(
      "Local 'main' is 1 commit behind origin/main.",
    );

    expect(trash).not.toHaveBeenCalled();
  });

  it("refuses on a dry run without fetching", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    pushNewerMain(repoRoot, 1);

    await expect(runWorktreeAdd("feature/new", { dryRun: true })).rejects.toThrow(
      "Local 'main' is behind origin/main.",
    );

    expect(git("for-each-ref", "--format=%(refname)", "refs/remotes", { cwd: repoRoot })).toBe("");
  });

  it("refuses when the current branch has also gained local commits", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    pushNewerMain(repoRoot, 1);
    commit(repoRoot, "local only");

    await expect(runWorktreeAdd("feature/new", {})).rejects.toThrow(
      "Local 'main' is 1 commit behind origin/main and has 1 commit that origin/main lacks.",
    );
  });

  it("creates the branch from the outdated HEAD with --allow-stale", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });
    pushNewerMain(repoRoot, 1);
    vi.mocked(setupProject).mockResolvedValueOnce();

    await expect(runWorktreeAdd("feature/new", { allowStale: true })).resolves.toBeUndefined();

    expect(git("rev-parse", "HEAD", { cwd: path.join(sandbox, "app-feature-new") })).toBe(
      git("rev-parse", "main", { cwd: repoRoot }),
    );
  });

  it("creates the branch when the current branch is only ahead of origin", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    commit(repoRoot, "local only");
    vi.mocked(setupProject).mockResolvedValueOnce();

    await expect(runWorktreeAdd("feature/new", {})).resolves.toBeUndefined();

    expect(listLocalBranches(repoRoot)).toBe("feature/new\nmain");
  });

  it("creates the branch from a detached HEAD without checking origin", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    pushNewerMain(repoRoot, 1);
    git("checkout", "--quiet", "--detach", { cwd: repoRoot });
    vi.mocked(setupProject).mockResolvedValueOnce();

    await expect(runWorktreeAdd("feature/new", {})).resolves.toBeUndefined();
  });

  it("still tracks a branch that exists on origin", async () => {
    const { repoRoot } = await createRepository({ withCommit: true });
    git("push", "--quiet", "origin", "main:refs/heads/feature/remote", { cwd: repoRoot });
    pushNewerMain(repoRoot, 1);
    vi.mocked(setupProject).mockResolvedValueOnce();

    await expect(runWorktreeAdd("feature/remote", {})).resolves.toBeUndefined();
  });
});

async function prepareCopyFailure(
  existing: boolean,
): Promise<{ sandbox: string; repoRoot: string }> {
  const fixture = await createRepository({ withCommit: true });
  if (existing) {
    git("branch", "feature/repair", { cwd: fixture.repoRoot });
  }
  await fs.writeFile(path.join(fixture.repoRoot, ".env"), "LOCAL_FIXTURE=yes\n");
  return fixture;
}

describe("runWorktreeAdd without local file copying", () => {
  it("keeps tracked files but leaves untracked and ignored files in the source checkout", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });
    await fs.writeFile(path.join(repoRoot, ".gitignore"), ".env\n");
    git("add", ".gitignore", { cwd: repoRoot });
    commit(repoRoot, "ignore local environment");
    await fs.writeFile(path.join(repoRoot, ".env"), "LOCAL_FIXTURE=yes\n");
    await fs.writeFile(path.join(repoRoot, "local.txt"), "local fixture\n");

    await runWorktreeAdd("feature/clean", { copy: false, setup: false });

    expect(
      git("symbolic-ref", "--short", "HEAD", { cwd: path.join(sandbox, "app-feature-clean") }),
    ).toBe("feature/clean");
    await expect(fs.readdir(path.join(sandbox, "app-feature-clean"))).resolves.toStrictEqual([
      ".git",
      ".gitignore",
    ]);
    await expect(fs.readFile(path.join(repoRoot, ".env"), "utf8")).resolves.toBe(
      "LOCAL_FIXTURE=yes\n",
    );
    await expect(fs.readFile(path.join(repoRoot, "local.txt"), "utf8")).resolves.toBe(
      "local fixture\n",
    );
  });

  it("still runs project setup when copying is disabled", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });

    await expect(runWorktreeAdd("feature/clean", { copy: false })).rejects.toThrow(
      "install failed",
    );

    await expect(fs.lstat(path.join(sandbox, "app-feature-clean"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(listLocalBranches(repoRoot)).toBe("main");
  });

  it("previews the skipped copy without enumerating local files or creating a checkout", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });
    await fs.writeFile(path.join(repoRoot, "local.txt"), "local fixture\n");
    vi.mocked(copyUntrackedFiles).mockClear();

    await runWorktreeAdd("feature/clean", { copy: false, setup: false, dryRun: true });

    await expect(fs.lstat(path.join(sandbox, "app-feature-clean"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(listLocalBranches(repoRoot)).toBe("main");
    expect(copyUntrackedFiles).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "DRY RUN: Would skip copying untracked and ignored local files (--no-copy).",
    );
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining("Would copy"));
  });
});

describe("runWorktreeAdd without project setup", () => {
  it("keeps the linked checkout and copies local files despite unavailable setup", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });
    await fs.writeFile(path.join(repoRoot, ".env"), "LOCAL_FIXTURE=yes\n");

    await runWorktreeAdd("feature/repair", { setup: false });

    expect(
      git("symbolic-ref", "--short", "HEAD", { cwd: path.join(sandbox, "app-feature-repair") }),
    ).toBe("feature/repair");
    await expect(
      fs.readFile(path.join(sandbox, "app-feature-repair", ".env"), "utf8"),
    ).resolves.toBe("LOCAL_FIXTURE=yes\n");
    await expect(fs.readFile(path.join(repoRoot, ".env"), "utf8")).resolves.toBe(
      "LOCAL_FIXTURE=yes\n",
    );
    expect(console.error).toHaveBeenCalledWith(
      "Skipping project setup (--no-setup): dependency installation and Next.js type generation.",
    );
  });

  it("plans the skipped setup without creating a checkout", async () => {
    const { sandbox, repoRoot } = await createRepository({ withCommit: true });

    await runWorktreeAdd("feature/repair", { setup: false, dryRun: true });

    await expect(fs.lstat(path.join(sandbox, "app-feature-repair"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(listLocalBranches(repoRoot)).toBe("main");
    expect(console.error).toHaveBeenCalledWith(
      "DRY RUN: Would skip project setup (--no-setup): dependency installation and Next.js type generation.",
    );
  });

  it.each([
    { existing: false, branches: "main" },
    { existing: true, branches: "feature/repair\nmain" },
  ])("cleans up a failed copy with existing branch: $existing", async ({ existing, branches }) => {
    const { sandbox, repoRoot } = await prepareCopyFailure(existing);
    vi.mocked(copyUntrackedFiles).mockRejectedValueOnce(new Error("copy failed"));

    await expect(runWorktreeAdd("feature/repair", { setup: false })).rejects.toThrow("copy failed");

    await expect(fs.lstat(path.join(sandbox, "app-feature-repair"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(listLocalBranches(repoRoot)).toBe(branches);
    await expect(fs.readFile(path.join(repoRoot, ".env"), "utf8")).resolves.toBe(
      "LOCAL_FIXTURE=yes\n",
    );
  });
});
