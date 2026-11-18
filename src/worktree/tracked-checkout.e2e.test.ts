import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWorktreeAdd } from "../cli/run-worktree-add.js";

const originalDirectory = process.cwd();
const temporaryDirectories: string[] = [];
const environment = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  WORKTREE_ADD_APP: "",
};

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "worktree-add-tracked-test-")),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: environment, encoding: "utf8" }).trim();
}

async function repository(): Promise<{ repo: string; target: string }> {
  const sandbox = await temporaryDirectory();
  git(sandbox, "init", "--quiet", "--template=", "--initial-branch=main", "app");
  const repo = path.join(sandbox, "app");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "core.autocrlf", "false");
  return { repo, target: path.join(sandbox, "app-feature-test") };
}

function commit(repo: string): void {
  git(repo, "add", ".");
  git(repo, "commit", "--quiet", "-m", "fixture");
}

async function runCli(repo: string): Promise<void> {
  process.chdir(repo);
  await runWorktreeAdd("feature/test", { offline: true, setup: false, copy: false });
}

function cloneStatus(source: string, destination: string): string {
  return execFileSync(
    "/usr/bin/swift",
    [
      "-e",
      `import Foundation
let files = try CommandLine.arguments.dropFirst().map {
  try URL(fileURLWithPath: $0).resourceValues(forKeys: [.volumeSupportsFileCloningKey, .fileContentIdentifierKey])
}
if files[0].volumeSupportsFileCloning == false { print("unsupported") }
else { print(files[0].fileContentIdentifier != nil && files[0].fileContentIdentifier == files[1].fileContentIdentifier) }`,
      source,
      destination,
    ],
    { encoding: "utf8" },
  ).trim();
}

beforeEach(() => {
  vi.stubEnv("GIT_CONFIG_GLOBAL", "/dev/null");
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  vi.stubEnv("GIT_AUTHOR_NAME", "Test");
  vi.stubEnv("GIT_AUTHOR_EMAIL", "test@example.com");
  vi.stubEnv("GIT_COMMITTER_NAME", "Test");
  vi.stubEnv("GIT_COMMITTER_EMAIL", "test@example.com");
  vi.stubEnv("WORKTREE_ADD_APP", "");
});

afterEach(async () => {
  process.chdir(originalDirectory);
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe.skipIf(process.platform !== "darwin")("tracked checkout through the CLI", () => {
  it("clones clean files without sharing edits and checks out dirty, transformed and xattr-bearing files normally", async ({
    skip,
  }) => {
    const { repo, target } = await repository();
    await fs.writeFile(
      path.join(repo, ".gitattributes"),
      "crlf.txt text eol=crlf\nfiltered.txt filter=fixture\n",
    );
    git(repo, "config", "filter.fixture.clean", "sed s/checkout/stored/g");
    git(repo, "config", "filter.fixture.smudge", "sed s/stored/checkout/g");
    await fs.mkdir(path.join(repo, "src"));
    await fs.writeFile(path.join(repo, "src/clean.txt"), "clean content\n");
    await fs.writeFile(path.join(repo, "run.sh"), "#!/bin/sh\necho hello\n", { mode: 0o755 });
    await fs.writeFile(path.join(repo, "dirty.txt"), "committed\n");
    await fs.writeFile(path.join(repo, "crlf.txt"), "line one\nline two\n");
    await fs.writeFile(path.join(repo, "filtered.txt"), "stored\n");
    await fs.writeFile(path.join(repo, "metadata.txt"), "metadata\n");
    await fs.writeFile(path.join(repo, "branch.txt"), "target version\n");
    commit(repo);
    git(repo, "branch", "feature/test");
    await fs.writeFile(path.join(repo, "branch.txt"), "source version\n");
    commit(repo);
    await fs.writeFile(path.join(repo, "dirty.txt"), "local edit\n");
    await fs.writeFile(path.join(repo, "crlf.txt"), "line one\r\nline two\r\n");
    await fs.writeFile(path.join(repo, "filtered.txt"), "checkout\n");
    execFileSync("/usr/bin/xattr", [
      "-w",
      "dev.worktree-add-test",
      "private",
      path.join(repo, "metadata.txt"),
    ]);

    await runCli(repo);

    const status = cloneStatus(
      path.join(repo, "src/clean.txt"),
      path.join(target, "src/clean.txt"),
    );
    skip(status === "unsupported", "Temporary volume does not support cloning");
    const hookListStatus = spawnSync("git", ["hook", "list", "post-checkout"], {
      cwd: repo,
    }).status;
    skip(hookListStatus !== 0 && hookListStatus !== 1, "Git does not support hook listing");
    expect(status).toBe("true");
    const mode = await fs.stat(path.join(target, "run.sh"));
    const result = {
      branch: await fs.readFile(path.join(target, "branch.txt"), "utf8"),
      dirty: await fs.readFile(path.join(target, "dirty.txt"), "utf8"),
      crlf: await fs.readFile(path.join(target, "crlf.txt"), "utf8"),
      filtered: await fs.readFile(path.join(target, "filtered.txt"), "utf8"),
      metadata: await fs.readFile(path.join(target, "metadata.txt"), "utf8"),
      xattrExit: spawnSync("/usr/bin/xattr", [
        "-p",
        "dev.worktree-add-test",
        path.join(target, "metadata.txt"),
      ]).status,
      // oxlint-disable-next-line no-bitwise -- inspect the owner's execute bit.
      executable: mode.mode & 0o100,
      gitStatus: git(target, "status", "--porcelain"),
    };
    expect(result).toStrictEqual({
      branch: "target version\n",
      dirty: "committed\n",
      crlf: "line one\r\nline two\r\n",
      filtered: "checkout\n",
      metadata: "metadata\n",
      xattrExit: 1,
      executable: 0o100,
      gitStatus: "",
    });
    await fs.writeFile(path.join(target, "src/clean.txt"), "target edit\n");
    await expect(fs.readFile(path.join(repo, "src/clean.txt"), "utf8")).resolves.toBe(
      "clean content\n",
    );
  });

  it("runs post-checkout hooks with the checked-out files already present", async () => {
    const { repo, target } = await repository();
    await fs.writeFile(path.join(repo, "tracked.txt"), "committed\n");
    commit(repo);
    const hook = path.join(repo, ".git/hooks/post-checkout");
    await fs.mkdir(path.dirname(hook), { recursive: true });
    await fs.writeFile(
      hook,
      "#!/bin/sh\ncat tracked.txt > hook-saw.txt\nprintf 'hook edit\\n' > tracked.txt\n",
      { mode: 0o755 },
    );

    await runCli(repo);

    await expect(fs.readFile(path.join(target, "hook-saw.txt"), "utf8")).resolves.toBe(
      "committed\n",
    );
    await expect(fs.readFile(path.join(target, "tracked.txt"), "utf8")).resolves.toBe(
      "hook edit\n",
    );
    await expect(fs.readFile(path.join(repo, "tracked.txt"), "utf8")).resolves.toBe("committed\n");
  });
});
