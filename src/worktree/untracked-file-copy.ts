/**
 * untracked-file-copy.ts
 *
 * Utilities for copying untracked files to worktrees
 */

import * as fs from "node:fs/promises";
import path from "node:path";
import { git } from "../git/git.js";
import {
  EXTRA_IGNORED_PATTERNS,
  globToRegExp,
  toPosixPath,
} from "./file-patterns.js";
import type { StatusLogger } from "../output/create-status-logger.js";
import { getStatusLogger } from "../output/get-status-logger.js";

/**
 * Copy untracked files from source to destination, excluding ignored patterns
 */
export async function copyUntrackedFiles(
  repoRoot: string,
  destinationDirectory: string,
  options?: { dryRun?: boolean; logger?: StatusLogger },
): Promise<void> {
  const logger = getStatusLogger(options?.logger);
  const dryRun = options?.dryRun ?? false;
  const extraIgnoredRegexes = EXTRA_IGNORED_PATTERNS.map((pattern) =>
    globToRegExp(pattern),
  );

  const untrackedEntries = new Set<string>();
  // Combine untracked-not-ignored (`--others`) and untracked-ignored (`--others --ignored`) entries.
  // These sets should be disjoint, but we dedupe defensively.
  const untrackedPaths = [
    ...git(
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z", // null-separated output for safe parsing
    )
      .split("\0")
      .filter(Boolean),
    ...git(
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "-z", // null-separated output for safe parsing
    )
      .split("\0")
      .filter(Boolean),
  ];
  for (const entry of untrackedPaths) {
    untrackedEntries.add(entry);
  }

  for (const relativePath of untrackedEntries) {
    const posixPath = toPosixPath(relativePath);
    if (extraIgnoredRegexes.some((regex) => regex.test(posixPath))) {
      continue;
    }
    const sourcePath = path.resolve(repoRoot, relativePath);
    const destinationPath = path.join(destinationDirectory, relativePath);
    const destinationExists = await fs
      .stat(destinationPath)
      .then(() => true)
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          return false;
        }
        throw error;
      });
    if (destinationExists) {
      logger.detail(`Skipped ${relativePath} (destination already exists).`);
      continue;
    }
    if (dryRun) {
      logger.detail(`Would copy ${relativePath}`);
      continue;
    }
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.cp(sourcePath, destinationPath, {
      recursive: true,
      errorOnExist: false,
    });
    logger.detail(`Copied ${relativePath}`);
  }
}
