import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StatusLogger } from "../output/create-status-logger.js";
import { copyLocalFiles } from "./copy-local-files.js";
import { parseCopyFileNames } from "./local-file-paths.js";
import type { PreflightedLocalFile } from "./preflight-local-files.js";
import {
  closePreflightedLocalFiles,
  composeSourceOpenFlags,
  preflightLocalFiles,
} from "./preflight-local-files.js";

const temporaryDirectories: string[] = [];
const fifoIsSupported = process.platform !== "win32";
const permissionsAreSupported = process.platform !== "win32";

function createFifo(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("mkfifo", [filePath], (error) => {
      if (error !== null) {
        if (error instanceof Error) {
          const wrappedError = new Error(error.message, { cause: error });
          if ("code" in error) {
            Object.assign(wrappedError, { code: error.code });
          }
          reject(wrappedError);
          return;
        }
        reject(new Error("Failed to create named pipe."));
        return;
      }
      resolve();
    });
  });
}

function readInheritedUmask(): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile("/bin/sh", ["-c", "umask"], (error, stdout) => {
      if (error !== null) {
        reject(new Error("Could not read process umask.", { cause: error }));
        return;
      }
      const umask = Number.parseInt(stdout.trim(), 8);
      if (!Number.isInteger(umask)) {
        reject(new Error(`Could not parse process umask: ${JSON.stringify(stdout)}`));
        return;
      }
      resolve(umask);
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
  const localFiles = await preflightFiles(repoRoot, relativePaths);
  try {
    await copyLocalFiles(destinationDirectory, localFiles, options);
  } finally {
    await closePreflightedLocalFiles(localFiles, options.logger);
  }
}

async function preflightFiles(repoRoot: string, fileNames: readonly string[]) {
  return preflightLocalFiles(repoRoot, parseCopyFileNames(fileNames));
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
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe("copyLocalFiles", () => {
  it("copies only the explicitly requested regular file", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SECRET=value\n");
    await fs.writeFile(path.join(repoRoot, ".env.test.local"), "UNREQUESTED=value\n");

    await copyLocalFilesFromRepo(repoRoot, destinationDirectory, [".env.local"]);

    await expect(fs.readFile(path.join(destinationDirectory, ".env.local"), "utf8")).resolves.toBe(
      "SECRET=value\n",
    );
    await expect(
      fs.lstat(path.join(destinationDirectory, ".env.test.local")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it.skipIf(!permissionsAreSupported)(
    "never broadens source permissions under the active umask",
    async () => {
      const activeUmask = await readInheritedUmask();
      for (const sourceMode of [0o600, 0o664]) {
        const repoRoot = await createTemporaryDirectory();
        const destinationDirectory = await createTemporaryDirectory();
        const sourcePath = path.join(repoRoot, ".env.local");
        const destinationPath = path.join(destinationDirectory, ".env.local");
        await fs.writeFile(sourcePath, "SECRET=value\n");
        await fs.chmod(sourcePath, sourceMode);

        const localFiles = await preflightFiles(repoRoot, [".env.local"]);
        expect(localFiles[0]?.sourceMode).toBe(sourceMode);
        await copyLocalFiles(destinationDirectory, localFiles);
        await closePreflightedLocalFiles(localFiles);

        const destinationStat = await fs.stat(destinationPath);
        // eslint-disable-next-line no-bitwise -- POSIX permission bits are a bit mask.
        const destinationMode = destinationStat.mode & 0o777;
        // eslint-disable-next-line no-bitwise -- POSIX permission bits and umask are bit masks.
        expect(destinationMode).toBe(sourceMode & ~activeUmask & 0o777);
      }
    },
  );

  it("rejects paths instead of repository-root file names", () => {
    expect(() => {
      parseCopyFileNames(["/tmp/local.json"]);
    }).toThrow("--copy-file '/tmp/local.json' must be a single file name in the repository root.");
    expect(() => {
      parseCopyFileNames(["config/local.json"]);
    }).toThrow(
      "--copy-file 'config/local.json' must be a single file name in the repository root.",
    );
    expect(() => {
      parseCopyFileNames([String.raw`config\local.json`]);
    }).toThrow(
      String.raw`--copy-file 'config\local.json' must be a single file name in the repository root.`,
    );
    expect(() => {
      parseCopyFileNames([".."]);
    }).toThrow("--copy-file '..' must be a single file name in the repository root.");
    expect(() => {
      parseCopyFileNames([".env.local:secret"]);
    }).toThrow(
      "--copy-file '.env.local:secret' must be a single file name in the repository root.",
    );
  });

  it.each(["bad\0name", "bad\nname"])("rejects control characters in %j", (fileName) => {
    expect(() => {
      parseCopyFileNames([fileName]);
    }).toThrow("must be a single file name in the repository root");
  });

  it("deduplicates repeated copy-file input", () => {
    expect(parseCopyFileNames([".env.local", ".env.local"])).toStrictEqual([".env.local"]);
  });

  it("composes portable source flags when Windows constants are absent", () => {
    expect(composeSourceOpenFlags({})).toBe(0);
    expect(composeSourceOpenFlags({ O_NOFOLLOW: 32, O_NONBLOCK: 4 })).toBe(36);
  });

  it("rejects symbolic links", async () => {
    const repoRoot = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, "source.txt"), "local");
    await fs.symlink("source.txt", path.join(repoRoot, "local-link.txt"));

    await expect(preflightFiles(repoRoot, ["local-link.txt"])).rejects.toThrow(
      "--copy-file 'local-link.txt' must name a regular file.",
    );
  });

  it("rejects directories", async () => {
    const repoRoot = await createTemporaryDirectory();
    await fs.mkdir(path.join(repoRoot, "config"));

    await expect(preflightFiles(repoRoot, ["config"])).rejects.toThrow(
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

    await expect(preflightFiles(repoRoot, ["local.pipe"])).rejects.toThrow(
      "--copy-file 'local.pipe' must name a regular file.",
    );
  });

  it("preserves an existing destination file", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const logger = createLogger();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value\n");
    await fs.writeFile(path.join(destinationDirectory, ".env.local"), "DESTINATION=value\n");

    const localFiles = await preflightFiles(repoRoot, [".env.local"]);
    await copyLocalFiles(destinationDirectory, localFiles, { logger });
    await closePreflightedLocalFiles(localFiles, logger);

    await expect(fs.readFile(path.join(destinationDirectory, ".env.local"), "utf8")).resolves.toBe(
      "DESTINATION=value\n",
    );
    expect(logger.warn).toHaveBeenCalledWith("Skipped .env.local (destination already exists).");
    await expectFirstFileHandleClosed(localFiles);
  });

  it("removes a destination file created by a failed copy", async () => {
    const destinationDirectory = await createTemporaryDirectory();
    const destinationPath = path.join(destinationDirectory, ".env.local");
    const copyFailure = Object.assign(new Error("write failed"), { code: "EIO" });
    const source = new Readable({
      read() {
        this.push("PARTIAL=value");
        this.destroy(copyFailure);
      },
    });
    const [fileName] = parseCopyFileNames([".env.local"]);
    if (fileName === undefined) {
      throw new Error("Expected a parsed local file name.");
    }
    const localFiles = [
      {
        fileName,
        handle: { createReadStream: () => source },
        sourceMode: 0o600,
      },
    ] as unknown as PreflightedLocalFile[];

    await expect(copyLocalFiles(destinationDirectory, localFiles)).rejects.toThrow(
      "Failed to copy .env.local: write failed",
    );
    await expect(fs.lstat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes a destination file when an in-progress copy is aborted", async () => {
    const stagingParent = await createTemporaryDirectory();
    const destinationDirectory = path.join(stagingParent, "destination");
    await fs.mkdir(destinationDirectory);
    const destinationPath = path.join(destinationDirectory, ".env.local");
    const abortController = new AbortController();
    const [fileName] = parseCopyFileNames([".env.local"]);
    if (fileName === undefined) {
      throw new Error("Expected a parsed local file name.");
    }
    const source = new PassThrough();
    source.write(Buffer.alloc(1024 * 1024, "x"));
    const localFiles = [
      {
        fileName,
        handle: { createReadStream: () => source },
        sourceMode: 0o600,
      },
    ] as unknown as PreflightedLocalFile[];

    const copying = copyLocalFiles(destinationDirectory, localFiles, {
      signal: abortController.signal,
    });
    await vi.waitFor(async () => {
      const names = await fs.readdir(stagingParent);
      expect(names.some((name) => name.startsWith(".worktree-add-copy-"))).toBe(true);
    });
    await expect(fs.readdir(destinationDirectory)).resolves.toStrictEqual([]);
    abortController.abort();

    await expect(copying).rejects.toThrow(/aborted/u);
    await expect(fs.lstat(destinationPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readdir(stagingParent)).resolves.toStrictEqual(["destination"]);
  });

  it("removes secret-bearing staging even when no files are requested", async () => {
    const stagingParent = await createTemporaryDirectory();
    const destinationDirectory = path.join(stagingParent, "destination");
    const stalePid = 543_210;
    const staleDirectory = await fs.mkdtemp(
      path.join(stagingParent, `.worktree-add-copy-${stalePid}-`),
    );
    await fs.mkdir(destinationDirectory);
    await fs.writeFile(
      path.join(staleDirectory, "owner.json"),
      `${JSON.stringify({ kind: "copy-stage", owner: "worktree-add", pid: stalePid })}\n`,
    );
    await fs.writeFile(path.join(staleDirectory, "file"), "STALE_SECRET=value");
    const kill = vi.spyOn(process, "kill").mockImplementation((pid) => {
      if (pid === stalePid) {
        throw Object.assign(new Error("no such process"), { code: "ESRCH" });
      }
      return true;
    });

    await copyLocalFiles(destinationDirectory, []);

    await expect(fs.lstat(staleDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(kill).toHaveBeenCalledWith(stalePid, 0);
  });

  it("removes an empty unleased staging directory left before lease publication", async () => {
    const stagingParent = await createTemporaryDirectory();
    const destinationDirectory = path.join(stagingParent, "destination");
    const stalePid = 543_210;
    const staleDirectory = await fs.mkdtemp(
      path.join(stagingParent, `.worktree-add-copy-${stalePid}-`),
    );
    await fs.mkdir(destinationDirectory);
    vi.spyOn(process, "kill").mockImplementation((pid) => {
      if (pid === stalePid) {
        throw Object.assign(new Error("no such process"), { code: "ESRCH" });
      }
      return true;
    });

    await copyLocalFiles(destinationDirectory, []);

    await expect(fs.lstat(staleDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves active and unowned staging directories", async () => {
    const repoRoot = await createTemporaryDirectory();
    const stagingParent = await createTemporaryDirectory();
    const destinationDirectory = path.join(stagingParent, "destination");
    const activeDirectory = await fs.mkdtemp(
      path.join(stagingParent, `.worktree-add-copy-${process.pid}-`),
    );
    const unownedDirectory = await fs.mkdtemp(
      path.join(stagingParent, ".worktree-add-copy-543210-"),
    );
    await fs.mkdir(destinationDirectory);
    await fs.writeFile(path.join(repoRoot, ".env.local"), "CURRENT=value");
    await fs.writeFile(
      path.join(activeDirectory, "owner.json"),
      `${JSON.stringify({ kind: "copy-stage", owner: "worktree-add", pid: process.pid })}\n`,
    );
    await fs.writeFile(path.join(activeDirectory, "file"), "ACTIVE_SECRET=value");
    await fs.writeFile(path.join(unownedDirectory, "file"), "UNOWNED=value");

    await copyLocalFilesFromRepo(repoRoot, destinationDirectory, [".env.local"]);

    await expect(fs.readFile(path.join(activeDirectory, "file"), "utf8")).resolves.toBe(
      "ACTIVE_SECRET=value",
    );
    await expect(fs.readFile(path.join(unownedDirectory, "file"), "utf8")).resolves.toBe(
      "UNOWNED=value",
    );
  });

  it("preserves a destination that an aborted copy never opened", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const destinationPath = path.join(destinationDirectory, ".env.local");
    const abortController = new AbortController();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value");
    await fs.writeFile(destinationPath, "DESTINATION=value");
    const localFiles = await preflightFiles(repoRoot, [".env.local"]);
    abortController.abort();

    await expect(
      copyLocalFiles(destinationDirectory, localFiles, {
        assumeDestinationEmpty: true,
        signal: abortController.signal,
      }),
    ).rejects.toThrow(/aborted|exist/u);
    await expect(fs.readFile(destinationPath, "utf8")).resolves.toBe("DESTINATION=value");
    await closePreflightedLocalFiles(localFiles);
  });

  it("does not write files in a dry run", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const logger = createLogger();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SECRET=value\n");

    const localFiles = await preflightFiles(repoRoot, [".env.local"]);
    await copyLocalFiles(destinationDirectory, localFiles, {
      dryRun: true,
      logger,
    });
    await closePreflightedLocalFiles(localFiles, logger);

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
      assumeDestinationEmpty: true,
      dryRun: true,
      logger,
    });

    expect(logger.detail).toHaveBeenCalledWith("Would copy .env.local");
  });

  it("preflights every requested source before destination handling", async () => {
    const repoRoot = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value\n");

    await expect(preflightFiles(repoRoot, [".env.local", "missing.json"])).rejects.toThrow(
      `--copy-file 'missing.json' must name an existing regular file in repository root '${repoRoot}'.`,
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
    const localFiles = await preflightFiles(repoRoot, [".env.local"]);
    await fs.rm(sourcePath);
    await fs.symlink(outsidePath, sourcePath);

    await copyLocalFiles(destinationDirectory, localFiles);
    await closePreflightedLocalFiles(localFiles);

    await expect(fs.readFile(path.join(destinationDirectory, ".env.local"), "utf8")).resolves.toBe(
      "ORIGINAL=value\n",
    );
    await expectFirstFileHandleClosed(localFiles);
  });
});
