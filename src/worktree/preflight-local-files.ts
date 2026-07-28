import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import { ensureRegularDirectory, getRootFilePath, isNotFound } from "./local-file-paths.js";
import type { CopyFileName } from "./local-file-paths.js";

export interface PreflightedLocalFile {
  readonly fileName: CopyFileName;
  readonly handle: fs.FileHandle;
  readonly sourceMode: number;
}

interface SourceOpenConstants {
  readonly O_NOFOLLOW?: number;
  readonly O_NONBLOCK?: number;
}

interface PreflightLocalFilesOptions {
  readonly logger?: StatusLogger;
}

export const composeSourceOpenFlags = (openConstants: SourceOpenConstants): number =>
  // eslint-disable-next-line no-bitwise -- Node file-open flags are bit masks.
  (openConstants.O_NOFOLLOW ?? 0) | (openConstants.O_NONBLOCK ?? 0);

const isTooManySymlinks = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ELOOP";

export async function closePreflightedLocalFiles(
  localFiles: readonly { readonly handle: fs.FileHandle }[],
  logger: StatusLogger = fallbackStatusLogger,
): Promise<void> {
  const results = await Promise.allSettled(localFiles.map(async ({ handle }) => handle.close()));
  for (const result of results) {
    if (result.status === "rejected") {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      logger.warn(`Failed to close a local copy source file: ${message}`);
    }
  }
}

const missingSourceFileMessage = (fileName: CopyFileName, repoRoot: string): string =>
  `--copy-file '${fileName}' must name an existing regular file in repository root '${repoRoot}'.`;

const sourceOpenFailure = (fileName: CopyFileName, repoRoot: string, error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  const failure = new Error(
    `Failed to open --copy-file '${fileName}' in repository root '${repoRoot}': ${message}`,
    { cause: error },
  );
  if (error instanceof Error && "code" in error) {
    Object.assign(failure, { code: error.code });
  }
  return failure;
};

async function getSourcePathStat(sourcePath: string, fileName: CopyFileName, repoRoot: string) {
  try {
    return await fs.lstat(sourcePath);
  } catch (error: unknown) {
    if (isNotFound(error)) {
      throw new Error(missingSourceFileMessage(fileName, repoRoot), {
        cause: error,
      });
    }
    throw error;
  }
}

async function openRegularSourceFile(
  repoRoot: string,
  fileName: CopyFileName,
  logger: StatusLogger,
): Promise<PreflightedLocalFile> {
  const sourcePath = getRootFilePath(repoRoot, fileName);
  await ensureRegularDirectory(repoRoot, "Copy source");
  const initialPathStat = await getSourcePathStat(sourcePath, fileName, repoRoot);
  if (initialPathStat.isSymbolicLink() || !initialPathStat.isFile()) {
    throw new Error(`--copy-file '${fileName}' must name a regular file.`);
  }

  let handle: fs.FileHandle;
  try {
    handle = await fs.open(sourcePath, composeSourceOpenFlags(constants));
  } catch (error: unknown) {
    if (isNotFound(error)) {
      throw new Error(missingSourceFileMessage(fileName, repoRoot), {
        cause: error,
      });
    }
    if (isTooManySymlinks(error)) {
      throw new Error(`--copy-file '${fileName}' must name a regular file.`, { cause: error });
    }
    throw sourceOpenFailure(fileName, repoRoot, error);
  }

  try {
    const sourceStat = await handle.stat();
    const currentPathStat = await getSourcePathStat(sourcePath, fileName, repoRoot);
    const pathChanged =
      currentPathStat.isSymbolicLink() ||
      !currentPathStat.isFile() ||
      initialPathStat.dev !== sourceStat.dev ||
      initialPathStat.ino !== sourceStat.ino ||
      currentPathStat.dev !== sourceStat.dev ||
      currentPathStat.ino !== sourceStat.ino;
    if (!sourceStat.isFile() || pathChanged) {
      throw new Error(`--copy-file '${fileName}' must name a stable regular file.`);
    }
    // eslint-disable-next-line no-bitwise -- POSIX permission bits are a bit mask.
    const sourceMode = sourceStat.mode & 0o777;
    return { fileName, handle, sourceMode };
  } catch (error) {
    await closePreflightedLocalFiles([{ handle }], logger);
    throw error;
  }
}

export async function preflightLocalFiles(
  repoRoot: string,
  fileNames: readonly CopyFileName[],
  options: PreflightLocalFilesOptions = {},
): Promise<PreflightedLocalFile[]> {
  const logger = options.logger ?? fallbackStatusLogger;
  const localFiles: PreflightedLocalFile[] = [];
  try {
    for (const fileName of fileNames) {
      localFiles.push(await openRegularSourceFile(repoRoot, fileName, logger));
    }
    return localFiles;
  } catch (error) {
    await closePreflightedLocalFiles(localFiles, logger);
    throw error;
  }
}
