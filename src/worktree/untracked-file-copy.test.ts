import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { git } from "../git/git.js";
import type { StatusLogger } from "../output/create-status-logger.js";
import { copyUntrackedFiles } from "./untracked-file-copy.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "worktree-add-copy-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createRepository(): Promise<string> {
  const repoRoot = await createTemporaryDirectory();
  git("init", "--quiet", { cwd: repoRoot });
  return repoRoot;
}

function commitEmpty(repoRoot: string): void {
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "--allow-empty",
    "-m",
    "init",
    { cwd: repoRoot },
  );
}

function createRecordingLogger(): { logger: StatusLogger; details: string[]; warnings: string[] } {
  const details: string[] = [];
  const warnings: string[] = [];
  const logger: StatusLogger = {
    step: vi.fn<(message: string) => void>(),
    success: vi.fn<(message: string) => void>(),
    detail(message) {
      details.push(message);
    },
    warn(message) {
      warnings.push(message);
    },
  };
  return { logger, details, warnings };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("copyUntrackedFiles", () => {
  it("copies local configuration while skipping generated output at any depth", async () => {
    const repoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(
      path.join(repoRoot, ".gitignore"),
      ".env\n.npmrc\nnode_modules/\ndist/\n*.tsbuildinfo\n",
    );
    await fs.writeFile(path.join(repoRoot, ".env"), "LOCAL=true\n");
    await fs.writeFile(path.join(repoRoot, ".npmrc"), "registry=https://registry.example\n");
    await fs.writeFile(path.join(repoRoot, "tsconfig.tsbuildinfo"), "generated\n");
    await fs.mkdir(path.join(repoRoot, "packages/app/node_modules/package"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(repoRoot, "packages/app/node_modules/package/index.js"),
      "generated\n",
    );
    await fs.mkdir(path.join(repoRoot, "packages/app/dist"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, "packages/app/dist/index.js"), "generated\n");

    await copyUntrackedFiles(repoRoot, destinationDirectory);

    await expect(fs.readFile(path.join(destinationDirectory, ".env"), "utf8")).resolves.toBe(
      "LOCAL=true\n",
    );
    await expect(fs.readFile(path.join(destinationDirectory, ".npmrc"), "utf8")).resolves.toBe(
      "registry=https://registry.example\n",
    );
    await expect(
      fs.lstat(path.join(destinationDirectory, "tsconfig.tsbuildinfo")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.lstat(path.join(destinationDirectory, "packages/app/node_modules/package/index.js")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.lstat(path.join(destinationDirectory, "packages/app/dist/index.js")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.skipIf(process.platform === "win32")(
    "preserves relative links to copied local configuration",
    async () => {
      const repoRoot = await createRepository();
      const destinationDirectory = await createTemporaryDirectory();
      await fs.writeFile(path.join(repoRoot, ".gitignore"), ".env\nconfig/local.env\n");
      await fs.mkdir(path.join(repoRoot, "config"));
      await fs.writeFile(path.join(repoRoot, "config/local.env"), "LOCAL=true\n");
      await fs.symlink("config/local.env", path.join(repoRoot, ".env"));

      await copyUntrackedFiles(repoRoot, destinationDirectory);

      await expect(fs.readlink(path.join(destinationDirectory, ".env"))).resolves.toBe(
        "config/local.env",
      );
      await expect(
        fs.readFile(path.join(destinationDirectory, "config/local.env"), "utf8"),
      ).resolves.toBe("LOCAL=true\n");
    },
  );

  it.skipIf(process.platform === "win32")("preserves a dangling destination symlink", async () => {
    const repoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".gitignore"), ".env\n");
    await fs.writeFile(path.join(repoRoot, ".env"), "LOCAL=true\n");
    await fs.symlink("missing.env", path.join(destinationDirectory, ".env"));

    await copyUntrackedFiles(repoRoot, destinationDirectory);

    await expect(fs.readlink(path.join(destinationDirectory, ".env"))).resolves.toBe("missing.env");
    await expect(fs.lstat(path.join(destinationDirectory, "missing.env"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("skips an ignored nested clone with a .git directory and names it on stderr", async () => {
    const repoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".gitignore"), "sources/\n");
    git("init", "--quiet", "sources/codex", { cwd: repoRoot });
    await fs.writeFile(path.join(repoRoot, "sources/codex/README"), "nested\n");
    const { logger, warnings } = createRecordingLogger();

    await copyUntrackedFiles(repoRoot, destinationDirectory, { logger });

    await expect(fs.lstat(path.join(destinationDirectory, "sources"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(warnings).toStrictEqual(["Skipping sources/codex (nested git repository)."]);
  });

  it("skips an ignored nested worktree with a .git file", async () => {
    const repoRoot = await createRepository();
    const otherRepoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".gitignore"), "sources/\n");
    commitEmpty(otherRepoRoot);
    await fs.mkdir(path.join(repoRoot, "sources"));
    git("worktree", "add", "--quiet", "-b", "nested", path.join(repoRoot, "sources/linked"), {
      cwd: otherRepoRoot,
    });
    await fs.writeFile(path.join(repoRoot, "sources/linked/notes.txt"), "nested\n");
    const gitMarker = await fs.lstat(path.join(repoRoot, "sources/linked/.git"));
    expect(gitMarker.isFile()).toBe(true);
    const { logger, warnings } = createRecordingLogger();

    await copyUntrackedFiles(repoRoot, destinationDirectory, { logger });

    await expect(fs.lstat(path.join(destinationDirectory, "sources"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(warnings).toStrictEqual(["Skipping sources/linked (nested git repository)."]);
  });

  it("skips a directory whose .git file points nowhere and names it once", async () => {
    const repoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".gitignore"), "sources/\n");
    await fs.mkdir(path.join(repoRoot, "sources/broken/src"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, "sources/broken/.git"), "gitdir: /nonexistent\n");
    await fs.writeFile(path.join(repoRoot, "sources/broken/README"), "nested\n");
    await fs.writeFile(path.join(repoRoot, "sources/broken/src/index.ts"), "nested\n");
    const { logger, warnings } = createRecordingLogger();

    await copyUntrackedFiles(repoRoot, destinationDirectory, { logger });

    await expect(fs.lstat(path.join(destinationDirectory, "sources"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(warnings).toStrictEqual(["Skipping sources/broken (nested git repository)."]);
  });

  it("keeps copying ordinary local files next to a nested repository", async () => {
    const repoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".gitignore"), ".env\nsources/\nlocal/\n");
    await fs.writeFile(path.join(repoRoot, ".env"), "LOCAL=true\n");
    await fs.writeFile(path.join(repoRoot, "notes.txt"), "untracked\n");
    await fs.mkdir(path.join(repoRoot, "local"));
    await fs.writeFile(path.join(repoRoot, "local/token"), "secret\n");
    git("init", "--quiet", "sources/codex", { cwd: repoRoot });
    await fs.writeFile(path.join(repoRoot, "sources/codex/README"), "nested\n");
    const { logger, warnings } = createRecordingLogger();

    await copyUntrackedFiles(repoRoot, destinationDirectory, { logger });

    await expect(fs.readFile(path.join(destinationDirectory, ".env"), "utf8")).resolves.toBe(
      "LOCAL=true\n",
    );
    await expect(fs.readFile(path.join(destinationDirectory, "notes.txt"), "utf8")).resolves.toBe(
      "untracked\n",
    );
    await expect(fs.readFile(path.join(destinationDirectory, "local/token"), "utf8")).resolves.toBe(
      "secret\n",
    );
    expect(warnings).toStrictEqual(["Skipping sources/codex (nested git repository)."]);
  });

  it("reports a skipped nested repository without copying anything on a dry run", async () => {
    const repoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".gitignore"), "sources/\n");
    git("init", "--quiet", "sources/codex", { cwd: repoRoot });
    await fs.writeFile(path.join(repoRoot, "sources/codex/README"), "nested\n");
    const { logger, warnings } = createRecordingLogger();

    await copyUntrackedFiles(repoRoot, destinationDirectory, { dryRun: true, logger });

    expect(warnings).toStrictEqual(["Skipping sources/codex (nested git repository)."]);
  });

  it.skipIf(process.platform === "win32")(
    "does not fail on a socket or FIFO inside a skipped nested clone",
    async () => {
      const repoRoot = await createRepository();
      const destinationDirectory = await createTemporaryDirectory();
      await fs.writeFile(path.join(repoRoot, ".gitignore"), "sources/\n");
      const nestedGitDirectory = path.join(repoRoot, "sources/codex/.git");
      git("init", "--quiet", "sources/codex", { cwd: repoRoot });
      // A relative socket path stays under the platform's short sun_path limit.
      execFileSync(
        process.execPath,
        [
          "-e",
          "require('node:net').createServer().listen('fsmonitor--daemon.ipc', () => process.exit(0))",
        ],
        { cwd: nestedGitDirectory },
      );
      execFileSync("mkfifo", [path.join(nestedGitDirectory, "events.fifo")]);
      const { logger, warnings } = createRecordingLogger();

      await copyUntrackedFiles(repoRoot, destinationDirectory, { logger });

      await expect(fs.lstat(path.join(destinationDirectory, "sources"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(warnings).toStrictEqual(["Skipping sources/codex (nested git repository)."]);
    },
  );

  it("atomically preserves a destination created by a concurrent copy", async () => {
    const firstRepoRoot = await createRepository();
    const secondRepoRoot = await createRepository();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(firstRepoRoot, ".env"), "FIRST=true\n");
    await fs.writeFile(path.join(secondRepoRoot, ".env"), "SECOND=true\n");
    const details: string[] = [];
    const logger: StatusLogger = {
      step: vi.fn<(message: string) => void>(),
      success: vi.fn<(message: string) => void>(),
      detail(message) {
        details.push(message);
      },
      warn: vi.fn<(message: string) => void>(),
    };

    await Promise.all([
      copyUntrackedFiles(firstRepoRoot, destinationDirectory, { logger }),
      copyUntrackedFiles(secondRepoRoot, destinationDirectory, { logger }),
    ]);

    expect(details).toHaveLength(2);
    expect(details).toContain("Copied .env");
    expect(details).toContain("Skipped .env (destination already exists).");
  });
});
