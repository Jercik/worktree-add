import { createWriteStream } from "node:fs";
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
    try {
      await pipeline(
        handle.createReadStream({ autoClose: false }),
        createWriteStream(destinationPath, { flags: "wx", mode: sourceMode }),
      );
    } catch (error: unknown) {
      if (isAlreadyExists(error)) {
        logger.warn(`Skipped ${fileName} (destination already exists).`);
        continue;
      }
      throw error;
    }
    logger.detail(`Copied ${fileName}`);
  }
}
