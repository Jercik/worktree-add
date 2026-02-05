/**
 * setup.ts
 *
 * Utilities for setting up project dependencies and build artifacts
 */

import path from "node:path";
import { fileExists } from "../git/git.js";
import type { StatusLogger } from "../output/create-status-logger.js";
import { getStatusLogger } from "../output/get-status-logger.js";
import {
  installDependencies,
  runPackageManagerBinary,
} from "./package-manager.js";
import { isNextProject, isNextTypegenSupported } from "./next.js";

/**
 * Install dependencies and run Next.js typegen if applicable
 */
export async function setupProject(
  destinationDirectory: string,
  options: { dryRun?: boolean; logger?: StatusLogger } = {},
): Promise<void> {
  const logger = getStatusLogger(options.logger);
  const dryRun = options.dryRun ?? false;
  const packageJsonPath = path.join(destinationDirectory, "package.json");
  if (!(await fileExists(packageJsonPath))) {
    return;
  }

  await installDependencies(destinationDirectory, { dryRun, logger });

  // Run Next.js type generation if applicable
  if (await isNextProject(destinationDirectory)) {
    if (dryRun) {
      logger.step("Would run next typegen if supported");
      return;
    }
    logger.step("Checking Next.js CLI typegen support …");
    const hasTypegenSupport = await isNextTypegenSupported(
      destinationDirectory,
      { logger },
    );
    if (hasTypegenSupport) {
      await runPackageManagerBinary(destinationDirectory, "next", ["typegen"], {
        logger,
      });
    } else {
      logger.warn(
        "Skipping next typegen: installed Next.js CLI does not support this command.",
      );
    }
  }
}
