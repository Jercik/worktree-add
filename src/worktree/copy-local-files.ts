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
import { closePreflightedLocalFiles } from "./preflight-local-files.js";
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

  try {
    for (const { handle, relativePath } of localFiles) {
      const destinationPath = getRootFilePath(destinationDirectory, relativePath);
      if (!destinationWillBeReplaced && (await destinationExists(destinationPath))) {
        logger.detail(`Skipped ${relativePath} (destination already exists).`);
        continue;
      }
      if (dryRun) {
        logger.detail(`Would copy ${relativePath}`);
        continue;
      }
      await ensureRegularDirectory(destinationDirectory, "Copy destination");
      try {
        await pipeline(
          handle.createReadStream({ autoClose: false }),
          createWriteStream(destinationPath, { flags: "wx" }),
        );
      } catch (error: unknown) {
        if (isAlreadyExists(error)) {
          logger.detail(`Skipped ${relativePath} (destination already exists).`);
          continue;
        }
        throw error;
      }
      logger.detail(`Copied ${relativePath}`);
    }
  } finally {
    await closePreflightedLocalFiles(localFiles);
  }
}
