import type * as Fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StatusLogger } from "../output/create-status-logger.js";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof Fs>();
  return {
    ...fs,
    createWriteStream: vi.fn(
      () =>
        new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        }),
    ),
  };
});
vi.mock("node:stream/promises", () => ({ pipeline: vi.fn() }));

const fs = await import("node:fs/promises");
const fsModule = await import("node:fs");
const streamPromises = await import("node:stream/promises");
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
  it("preserves a destination file created after the existence check", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const logger = createLogger();
    const sourcePath = path.join(repoRoot, ".env.local");
    const destinationPath = path.join(destinationDirectory, ".env.local");
    await fs.writeFile(sourcePath, "SOURCE=value\n");
    vi.mocked(streamPromises.pipeline).mockRejectedValueOnce(
      Object.assign(new Error("file exists"), { code: "EEXIST" }),
    );
    const localFiles = await preflightLocalFiles(repoRoot, parseCopyFileNames([".env.local"]));

    await copyLocalFiles(destinationDirectory, localFiles, { logger });

    expect(fsModule.createWriteStream).toHaveBeenCalledWith(destinationPath, {
      flags: "wx",
      mode: localFiles[0]?.sourceMode,
    });
    expect(logger.detail).toHaveBeenCalledWith("Skipped .env.local (destination already exists).");
  });

  it("preserves the copy error when closing the source also fails", async () => {
    const repoRoot = await createTemporaryDirectory();
    const destinationDirectory = await createTemporaryDirectory();
    const logger = createLogger();
    await fs.writeFile(path.join(repoRoot, ".env.local"), "SOURCE=value\n");
    const localFiles = await preflightLocalFiles(repoRoot, parseCopyFileNames([".env.local"]));
    const localFile = localFiles.at(0);
    if (localFile === undefined) {
      throw new Error("Expected a preflighted local file.");
    }
    const close = vi
      .spyOn(localFile.handle, "close")
      .mockRejectedValueOnce(new Error("close failed"));
    vi.mocked(streamPromises.pipeline).mockRejectedValueOnce(new Error("copy failed"));

    await expect(copyLocalFiles(destinationDirectory, localFiles, { logger })).rejects.toThrow(
      "copy failed",
    );

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to close local copy source files after an error: Failed to close a local copy source file.",
    );
    close.mockRestore();
    await localFile.handle.close();
  });
});
