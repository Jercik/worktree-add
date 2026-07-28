import type * as Fs from "node:fs/promises";
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

  it.each(["EOPNOTSUPP", "EXDEV"])(
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
