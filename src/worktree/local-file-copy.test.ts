import { execFile } from "node:child_process";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StatusLogger } from "../output/create-status-logger.js";
import { copyLocalFiles, preflightLocalFiles, validateCopyFilePaths } from "./local-file-copy.js";

const temporaryDirectories: string[] = [];
const fifoIsSupported = process.platform !== "win32" && constants.O_NONBLOCK !== undefined;

function createFifo(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("mkfifo", [filePath], (error) => {
      if (error !== null) {
        if (error instanceof Error) {
          reject(new Error(error.message, { cause: error }));
          return;
        }
        reject(new Error("Failed to create named pipe."));
        return;
      }
      resolve();
    });
  });
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "worktree-add-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

const ignoreMessage = (message: string): void => {
  void message;
};

const createLogger = (): StatusLogger => ({
  step: vi.fn(ignoreMessage),
  success: vi.fn(ignoreMessage),
  detail: vi.fn(ignoreMessage),
  warn: vi.fn(ignoreMessage),
});

async function copyLocalFilesFromRepo(
  repoRoot: string,
  destinationDirectory: string,
  relativePaths: readonly string[],
  options: Parameters<typeof copyLocalFiles>[2] = {},
): Promise<void> {
  const localFiles = await preflightLocalFiles(repoRoot, relativePaths);
  await copyLocalFiles(destinationDirectory, localFiles, options);
}

async function expectFirstFileHandleClosed(
  localFiles: Awaited<ReturnType<typeof preflightLocalFiles>>,
): Promise<void> {
  const localFile = localFiles.at(0);
  if (localFile === undefined) {
    throw new Error("Expected a preflighted local file.");
  }
  await expect(localFile.handle.stat()).rejects.toThrow(/closed/u);
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe("copyLocalFiles", () => {
  it("copies only the explicitly requested regular file", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SECRET=value\n");
    await fs.writeFile(path.join(repoRoot, ".npmrc"), "registry=https://registry.npmjs.org/\n");

    await copyLocalFilesFromRepo(repoRoot, destinationDirectory, [".env.local"]);

    await expect(fs.readFile(path.join(destinationDirectory, ".env.local"), "utf8")).resolves.toBe(
      "SECRET=value\n",
    );
    await expect(fs.lstat(path.join(destinationDirectory, ".npmrc"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects paths instead of repository-root file names", () => {
    expect(() => {
      validateCopyFilePaths(["/tmp/local.json"]);
    }).toThrow("--copy-file '/tmp/local.json' must be a single file name in the repository root.");
    expect(() => {
      validateCopyFilePaths(["config/local.json"]);
    }).toThrow(
      "--copy-file 'config/local.json' must be a single file name in the repository root.",
    );
    expect(() => {
      validateCopyFilePaths([String.raw`config\local.json`]);
    }).toThrow(
      String.raw`--copy-file 'config\local.json' must be a single file name in the repository root.`,
    );
    expect(() => {
      validateCopyFilePaths([".."]);
    }).toThrow("--copy-file '..' must be a single file name in the repository root.");
  });

  it("rejects symbolic links", async () => {
    const repoRoot = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, "source.txt"), "local");
    await fs.symlink("source.txt", path.join(repoRoot, "local-link.txt"));

    await expect(preflightLocalFiles(repoRoot, ["local-link.txt"])).rejects.toThrow(
      "--copy-file 'local-link.txt' must name a regular file.",
    );
  });

  it("rejects directories", async () => {
    const repoRoot = await createTemporaryDirectory();
    await fs.mkdir(path.join(repoRoot, "config"));

    await expect(preflightLocalFiles(repoRoot, ["config"])).rejects.toThrow(
      "--copy-file 'config' must name a regular file.",
    );
  });

  it.skipIf(!fifoIsSupported)("rejects a named pipe without waiting for a writer", async () => {
    const repoRoot = await createTemporaryDirectory();
    const fifoPath = path.join(repoRoot, "local.pipe");
    try {
      await createFifo(fifoPath);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }

    await expect(preflightLocalFiles(repoRoot, ["local.pipe"])).rejects.toThrow(
      "--copy-file 'local.pipe' must name a regular file.",
    );
  });

  it("preserves an existing destination file", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const logger = createLogger();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value\n");
    await fs.writeFile(path.join(destinationDirectory, ".env.local"), "DESTINATION=value\n");

    const localFiles = await preflightLocalFiles(repoRoot, [".env.local"]);
    await copyLocalFiles(destinationDirectory, localFiles, { logger });

    await expect(fs.readFile(path.join(destinationDirectory, ".env.local"), "utf8")).resolves.toBe(
      "DESTINATION=value\n",
    );
    expect(logger.detail).toHaveBeenCalledWith("Skipped .env.local (destination already exists).");
    await expectFirstFileHandleClosed(localFiles);
  });

  it("does not write files in a dry run", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const logger = createLogger();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SECRET=value\n");

    const localFiles = await preflightLocalFiles(repoRoot, [".env.local"]);
    await copyLocalFiles(destinationDirectory, localFiles, {
      dryRun: true,
      logger,
    });

    await expect(fs.lstat(path.join(destinationDirectory, ".env.local"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(logger.detail).toHaveBeenCalledWith("Would copy .env.local");
    await expectFirstFileHandleClosed(localFiles);
  });

  it("models a destination that dry-run will replace as empty", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const logger = createLogger();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value\n");
    await fs.writeFile(path.join(destinationDirectory, ".env.local"), "STALE=value\n");

    await copyLocalFilesFromRepo(repoRoot, destinationDirectory, [".env.local"], {
      destinationWillBeReplaced: true,
      dryRun: true,
      logger,
    });

    expect(logger.detail).toHaveBeenCalledWith("Would copy .env.local");
  });

  it("preflights every requested source before destination handling", async () => {
    const repoRoot = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value\n");

    await expect(preflightLocalFiles(repoRoot, [".env.local", "missing.json"])).rejects.toThrow(
      "--copy-file 'missing.json' must name an existing regular file.",
    );
  });

  it("copies the inode opened during preflight after its path becomes a symbolic link", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const outsideDirectory = await createTemporaryDirectory();
    const sourcePath = path.join(repoRoot, ".env.local");
    const outsidePath = path.join(outsideDirectory, "replacement.env");
    await fs.writeFile(sourcePath, "ORIGINAL=value\n");
    await fs.writeFile(outsidePath, "REPLACEMENT=value\n");
    const localFiles = await preflightLocalFiles(repoRoot, [".env.local"]);
    await fs.rm(sourcePath);
    await fs.symlink(outsidePath, sourcePath);

    await copyLocalFiles(destinationDirectory, localFiles);

    await expect(fs.readFile(path.join(destinationDirectory, ".env.local"), "utf8")).resolves.toBe(
      "ORIGINAL=value\n",
    );
    await expectFirstFileHandleClosed(localFiles);
  });
});
