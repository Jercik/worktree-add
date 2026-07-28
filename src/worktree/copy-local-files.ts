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
import {
  closePreflightedLocalFiles,
  closePreflightedLocalFilesAfterError,
} from "./preflight-local-files.js";
import type { PreflightedLocalFile } from "./preflight-local-files.js";

export interface CopyLocalFilesOptions {
  readonly destinationWillBeReplaced?: boolean;
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
  const destinationWillBeReplaced = options.destinationWillBeReplaced ?? false;
  let primaryErrorInFlight = false;

  try {
    for (const { fileName, handle, sourceMode } of localFiles) {
      const destinationPath = getRootFilePath(destinationDirectory, fileName);
      if (!destinationWillBeReplaced && (await destinationExists(destinationPath))) {
        logger.detail(`Skipped ${fileName} (destination already exists).`);
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
          logger.detail(`Skipped ${fileName} (destination already exists).`);
          continue;
        }
        throw error;
      }
      logger.detail(`Copied ${fileName}`);
    }
  } catch (error) {
    primaryErrorInFlight = true;
    throw error;
  } finally {
    await (primaryErrorInFlight
      ? closePreflightedLocalFilesAfterError(localFiles, logger)
      : closePreflightedLocalFiles(localFiles));
  }
}
