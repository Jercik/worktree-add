import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { ensureRegularDirectory, getRootFilePath, isNotFound } from "./local-file-paths.js";

export interface PreflightedLocalFile {
  readonly handle: fs.FileHandle;
  readonly relativePath: string;
}

const isTooManySymlinks = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ELOOP";

async function openRegularSourceFile(
  repoRoot: string,
  relativePath: string,
): Promise<PreflightedLocalFile> {
  const sourcePath = getRootFilePath(repoRoot, relativePath);
  await ensureRegularDirectory(repoRoot, "Copy source");
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(sourcePath, constants.O_NOFOLLOW + constants.O_NONBLOCK);
  } catch (error: unknown) {
    if (isNotFound(error)) {
      throw new Error(`--copy-file '${relativePath}' must name an existing regular file.`, {
        cause: error,
      });
    }
    if (isTooManySymlinks(error)) {
      throw new Error(`--copy-file '${relativePath}' must name a regular file.`, { cause: error });
    }
    throw error;
  }
  try {
    const sourceStat = await handle.stat();
    if (!sourceStat.isFile()) {
      throw new Error(`--copy-file '${relativePath}' must name a regular file.`);
    }
    return { handle, relativePath };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

export async function closePreflightedLocalFiles(
  localFiles: readonly PreflightedLocalFile[],
): Promise<void> {
  const results = await Promise.allSettled(localFiles.map(async ({ handle }) => handle.close()));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") {
    throw new Error("Failed to close a local copy source file.", { cause: failure.reason });
  }
}

export async function preflightLocalFiles(
  repoRoot: string,
  relativePaths: readonly string[],
): Promise<PreflightedLocalFile[]> {
  const localFiles: PreflightedLocalFile[] = [];
  try {
    for (const relativePath of relativePaths) {
      localFiles.push(await openRegularSourceFile(repoRoot, relativePath));
    }
    return localFiles;
  } catch (error) {
    await closePreflightedLocalFiles(localFiles);
    throw error;
  }
}
