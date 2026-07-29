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
