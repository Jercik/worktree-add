import type * as Fs from "node:fs/promises";
import { renameSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StatusLogger } from "../output/create-status-logger.js";
import type { PreflightedLocalFile } from "./preflight-local-files.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>();
  return { ...fs, link: vi.fn(fs.link), open: vi.fn(fs.open) };
});

const fs = await import("node:fs/promises");
const { copyLocalFiles } = await import("./copy-local-files.js");
const { parseCopyFileNames } = await import("./local-file-paths.js");
const { preflightLocalFiles } = await import("./preflight-local-files.js");

const temporaryDirectories: string[] = [];

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

afterEach(async () => {
  vi.clearAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe("copyLocalFiles", () => {
  it("preserves a destination claimed before staged publication", async () => {
    const destinationDirectory = await createTemporaryDirectory();
    const destinationPath = path.join(destinationDirectory, ".env.local");
    const logger = createLogger();
    const [fileName] = parseCopyFileNames([".env.local"]);
    if (fileName === undefined) {
      throw new Error("Expected a parsed local file name.");
    }
    const localFiles = [
      {
        fileName,
        handle: { createReadStream: () => Readable.from(["SOURCE=value"]) },
        sourceMode: 0o600,
      },
    ] as unknown as PreflightedLocalFile[];
    vi.mocked(fs.link).mockImplementationOnce(async () => {
      await fs.writeFile(destinationPath, "REPLACEMENT=value");
      throw Object.assign(new Error("file exists"), { code: "EEXIST" });
    });

    await copyLocalFiles(destinationDirectory, localFiles, { logger });

    await expect(fs.readFile(destinationPath, "utf8")).resolves.toBe("REPLACEMENT=value");
    expect(logger.warn).toHaveBeenCalledWith("Skipped .env.local (destination already exists).");
    await expect(fs.readdir(destinationDirectory)).resolves.toStrictEqual([".env.local"]);
  });

  it.each(["EOPNOTSUPP", "EXDEV", "ENOSYS"])(
    "falls back to an exclusive copy when hard links fail with %s",
    async (code) => {
      const destinationDirectory = await createTemporaryDirectory();
      const destinationPath = path.join(destinationDirectory, ".env.local");
      const [fileName] = parseCopyFileNames([".env.local"]);
      if (fileName === undefined) {
        throw new Error("Expected a parsed local file name.");
      }
      const localFiles = [
        {
          fileName,
          handle: { createReadStream: () => Readable.from(["SOURCE=value"]) },
          sourceMode: 0o600,
        },
      ] as unknown as PreflightedLocalFile[];
      vi.mocked(fs.link).mockRejectedValueOnce(
        Object.assign(new Error("hard link unavailable"), { code }),
      );

      await copyLocalFiles(destinationDirectory, localFiles);

      await expect(fs.readFile(destinationPath, "utf8")).resolves.toBe("SOURCE=value");
    },
  );

  it("reports copied and not-attempted files after a mid-list failure", async () => {
    const destinationDirectory = await createTemporaryDirectory();
    const fileNames = parseCopyFileNames([".env.local", ".npmrc", ".tool-versions"]);
    const localFiles = fileNames.map(
      (fileName) =>
        ({
          fileName,
          handle: { createReadStream: () => Readable.from([`SOURCE=${fileName}`]) },
          sourceMode: 0o600,
        }) as unknown as PreflightedLocalFile,
    );
    vi.mocked(fs.link)
      .mockImplementationOnce(async (temporaryPath, destinationPath) => {
        await fs.copyFile(temporaryPath, destinationPath);
      })
      .mockRejectedValueOnce(Object.assign(new Error("permission denied"), { code: "EACCES" }));

    await expect(copyLocalFiles(destinationDirectory, localFiles)).rejects.toThrow(
      "Failed to copy .npmrc: permission denied\n" +
        "Copied before failure: .env.local.\n" +
        "Not attempted after this failure: .tool-versions.",
    );
  });

  it("reports progress when aborted between files", async () => {
    const destinationDirectory = await createTemporaryDirectory();
    const abortController = new AbortController();
    const logger = createLogger();
    vi.mocked(logger.detail).mockImplementation((message) => {
      if (message === "Copied .env.local") {
        abortController.abort();
      }
    });
    const fileNames = parseCopyFileNames([".env.local", ".npmrc", ".tool-versions"]);
    const localFiles = fileNames.map(
      (fileName) =>
        ({
          fileName,
          handle: { createReadStream: () => Readable.from([`SOURCE=${fileName}`]) },
          sourceMode: 0o600,
        }) as unknown as PreflightedLocalFile,
    );

    await expect(
      copyLocalFiles(destinationDirectory, localFiles, {
        logger,
        signal: abortController.signal,
      }),
    ).rejects.toThrow(
      "Failed to copy .npmrc: This operation was aborted\n" +
        "Copied before failure: .env.local.\n" +
        "Not attempted after this failure: .tool-versions.",
    );
  });

  it("reports every file when already aborted before a multi-file copy", async () => {
    const destinationDirectory = await createTemporaryDirectory();
    const abortController = new AbortController();
    abortController.abort();
    const fileNames = parseCopyFileNames([".env.local", ".npmrc", ".tool-versions"]);
    const localFiles = fileNames.map(
      (fileName) =>
        ({
          fileName,
          handle: { createReadStream: () => Readable.from([`SOURCE=${fileName}`]) },
          sourceMode: 0o600,
        }) as unknown as PreflightedLocalFile,
    );

    await expect(
      copyLocalFiles(destinationDirectory, localFiles, { signal: abortController.signal }),
    ).rejects.toThrow(
      "Failed to copy .env.local: This operation was aborted\n" +
        "Not attempted after this failure: .npmrc, .tool-versions.",
    );
  });

  it("does not publish outside a destination directory replaced during staging", async () => {
    const stagingParent = await createTemporaryDirectory();
    const destinationDirectory = path.join(stagingParent, "destination");
    const movedDestination = path.join(stagingParent, "moved-destination");
    const outsideDirectory = await createTemporaryDirectory();
    await fs.mkdir(destinationDirectory);
    const [fileName] = parseCopyFileNames([".env.local"]);
    if (fileName === undefined) {
      throw new Error("Expected a parsed local file name.");
    }
    let replaced = false;
    const source = new Readable({
      read() {
        if (!replaced) {
          replaced = true;
          renameSync(destinationDirectory, movedDestination);
          symlinkSync(outsideDirectory, destinationDirectory, "dir");
        }
        this.push("SECRET=value");
        this.push(null);
      },
    });
    const localFiles = [
      {
        fileName,
        handle: { createReadStream: () => source },
        sourceMode: 0o600,
      },
    ] as unknown as PreflightedLocalFile[];

    await expect(copyLocalFiles(destinationDirectory, localFiles)).rejects.toThrow(
      "Copy destination",
    );

    await expect(fs.readdir(movedDestination)).resolves.toStrictEqual([]);
    await expect(fs.readdir(outsideDirectory)).resolves.toStrictEqual([]);
  });

  it("does not trust a replacement destination directory between files", async () => {
    const stagingParent = await createTemporaryDirectory();
    const destinationDirectory = path.join(stagingParent, "destination");
    const movedDestination = path.join(stagingParent, "moved-destination");
    const outsideDirectory = await createTemporaryDirectory();
    await fs.mkdir(destinationDirectory);
    const fileNames = parseCopyFileNames([".env.local", ".npmrc", ".tool-versions"]);
    const localFiles = fileNames.map(
      (fileName) =>
        ({
          fileName,
          handle: { createReadStream: () => Readable.from([`SOURCE=${fileName}`]) },
          sourceMode: 0o600,
        }) as unknown as PreflightedLocalFile,
    );
    vi.mocked(fs.link).mockImplementationOnce(async (temporaryPath, destinationPath) => {
      await fs.copyFile(temporaryPath, destinationPath);
      renameSync(destinationDirectory, movedDestination);
      symlinkSync(outsideDirectory, destinationDirectory, "dir");
    });

    await expect(copyLocalFiles(destinationDirectory, localFiles)).rejects.toThrow(
      "Failed to copy .npmrc: Copy destination",
    );

    await expect(fs.readdir(movedDestination)).resolves.toStrictEqual([".env.local"]);
    await expect(fs.readdir(outsideDirectory)).resolves.toStrictEqual([]);
  });
});

describe("preflightLocalFiles", () => {
  it("adds copy-file and repository context to source open failures", async () => {
    const repoRoot = await createTemporaryDirectory();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value");
    const [fileName] = parseCopyFileNames([".env.local"]);
    if (fileName === undefined) {
      throw new Error("Expected a parsed local file name.");
    }
    vi.mocked(fs.open).mockRejectedValueOnce(
      Object.assign(new Error("permission denied"), { code: "EACCES" }),
    );

    await expect(preflightLocalFiles(repoRoot, [fileName])).rejects.toMatchObject({
      code: "EACCES",
      message: `Failed to open --copy-file '.env.local' in repository root '${repoRoot}': permission denied`,
    });
  });
});
