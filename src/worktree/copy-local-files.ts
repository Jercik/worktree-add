import { constants, createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import {
  destinationExists,
  ensureSameRegularDirectory,
  getRootFilePath,
  isAlreadyExists,
} from "./local-file-paths.js";
import { getCopyDestinationIdentity } from "./get-copy-destination-identity.js";
import { createLocalFileCopyFailure } from "./local-file-copy-failure.js";
import type { PreflightedLocalFile } from "./preflight-local-files.js";
import {
  createTemporaryCopyDirectory,
  removeStaleTemporaryCopies,
  removeTemporaryCopy,
} from "./temporary-copy-staging.js";

export interface CopyLocalFilesOptions {
  readonly assumeDestinationEmpty?: boolean;
  readonly dryRun?: boolean;
  readonly logger?: StatusLogger;
  readonly signal?: AbortSignal;
}

const isHardLinkUnsupported = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "EOPNOTSUPP" ||
    error.code === "ENOTSUP" ||
    error.code === "EPERM" ||
    error.code === "EXDEV" ||
    error.code === "ENOSYS");

async function publishTemporaryCopy(
  temporaryPath: string,
  destinationPath: string,
): Promise<boolean> {
  try {
    await fs.link(temporaryPath, destinationPath);
    return true;
  } catch (error: unknown) {
    if (isAlreadyExists(error)) {
      return false;
    }
    if (!isHardLinkUnsupported(error)) {
      throw error;
    }
  }
  try {
    await fs.copyFile(temporaryPath, destinationPath, constants.COPYFILE_EXCL);
    return true;
  } catch (error: unknown) {
    if (isAlreadyExists(error)) {
      return false;
    }
    throw error;
  }
}

export async function copyLocalFiles(
  destinationDirectory: string,
  localFiles: readonly PreflightedLocalFile[],
  options: CopyLocalFilesOptions = {},
): Promise<void> {
  const logger = options.logger ?? fallbackStatusLogger;
  const dryRun = options.dryRun ?? false;
  const assumeDestinationEmpty = options.assumeDestinationEmpty ?? false;
  const stagingParent = path.dirname(path.resolve(destinationDirectory));
  if (localFiles.length === 0) {
    options.signal?.throwIfAborted();
  }
  if (!dryRun) {
    await removeStaleTemporaryCopies(stagingParent, logger, {
      warnOnInspectionFailure: localFiles.length > 0,
    });
  }
  const destinationIdentity = await getCopyDestinationIdentity(
    destinationDirectory,
    localFiles,
    dryRun,
  );
  const copiedFileNames: string[] = [];

  for (const [index, { fileName, handle, sourceMode }] of localFiles.entries()) {
    const destinationPath = getRootFilePath(destinationDirectory, fileName);
    let temporaryDirectory: string | undefined;
    try {
      options.signal?.throwIfAborted();
      if (!assumeDestinationEmpty && (await destinationExists(destinationPath))) {
        logger.warn(`Skipped ${fileName} (destination already exists).`);
        continue;
      }
      if (dryRun) {
        logger.detail(
          `Would attempt to copy ${fileName} after setup if the destination does not exist`,
        );
        continue;
      }
      temporaryDirectory = await createTemporaryCopyDirectory(stagingParent);
      const temporaryPath = path.join(temporaryDirectory, "file");
      await pipeline(
        handle.createReadStream({ autoClose: false }),
        createWriteStream(temporaryPath, { flags: "wx", mode: sourceMode }),
        { signal: options.signal },
      );
      if (destinationIdentity === undefined) {
        throw new Error("Copy destination identity was not recorded.");
      }
      await ensureSameRegularDirectory(
        destinationDirectory,
        "Copy destination",
        destinationIdentity,
      );
      if (!(await publishTemporaryCopy(temporaryPath, destinationPath))) {
        logger.warn(`Skipped ${fileName} (destination already exists).`);
        continue;
      }
    } catch (error: unknown) {
      throw createLocalFileCopyFailure(
        fileName,
        error,
        copiedFileNames,
        localFiles.slice(index + 1).map((localFile) => localFile.fileName),
      );
    } finally {
      if (temporaryDirectory !== undefined) {
        await removeTemporaryCopy(temporaryDirectory, fileName, logger);
      }
    }
    copiedFileNames.push(fileName);
    logger.success(`Copied ${fileName}`);
  }
}
