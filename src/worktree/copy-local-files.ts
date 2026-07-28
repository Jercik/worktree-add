import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import {
  destinationExists,
  ensureRegularDirectory,
  getRootFilePath,
  isAlreadyExists,
} from "./local-file-paths.js";
import type { PreflightedLocalFile } from "./preflight-local-files.js";

export interface CopyLocalFilesOptions {
  readonly assumeDestinationEmpty?: boolean;
  readonly dryRun?: boolean;
  readonly logger?: StatusLogger;
  readonly signal?: AbortSignal;
}

const copyFailure = (fileName: string, error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  const failure = new Error(`Failed to copy ${fileName}: ${message}`, { cause: error });
  if (error instanceof Error && "code" in error) {
    Object.assign(failure, { code: error.code });
  }
  return failure;
};

async function removeTemporaryCopy(
  temporaryDirectory: string,
  fileName: string,
  logger: StatusLogger,
): Promise<void> {
  try {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to remove temporary copy of ${fileName}: ${message}`);
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

  for (const { fileName, handle, sourceMode } of localFiles) {
    const destinationPath = getRootFilePath(destinationDirectory, fileName);
    if (!assumeDestinationEmpty && (await destinationExists(destinationPath))) {
      logger.warn(`Skipped ${fileName} (destination already exists).`);
      continue;
    }
    if (dryRun) {
      logger.detail(`Would copy ${fileName}`);
      continue;
    }
    await ensureRegularDirectory(destinationDirectory, "Copy destination");
    const temporaryDirectory = await fs.mkdtemp(
      path.join(destinationDirectory, ".worktree-add-copy-"),
    );
    const temporaryPath = path.join(temporaryDirectory, "file");
    try {
      await pipeline(
        handle.createReadStream({ autoClose: false }),
        createWriteStream(temporaryPath, { flags: "wx", mode: sourceMode }),
        { signal: options.signal },
      );
      try {
        await fs.link(temporaryPath, destinationPath);
      } catch (error: unknown) {
        if (!isAlreadyExists(error)) {
          throw error;
        }
        logger.warn(`Skipped ${fileName} (destination already exists).`);
        continue;
      }
    } catch (error: unknown) {
      throw copyFailure(fileName, error);
    } finally {
      await removeTemporaryCopy(temporaryDirectory, fileName, logger);
    }
    logger.detail(`Copied ${fileName}`);
  }
}
