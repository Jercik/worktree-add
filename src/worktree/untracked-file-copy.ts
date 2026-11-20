import * as fs from "node:fs/promises";
import path from "node:path";
import { git } from "../git/git.js";
import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import { copyLocalEntry } from "./copy-local-entry.js";
import { isGeneratedPath } from "./is-generated-path.js";
import { isPathInside } from "./is-path-inside.js";

const hasErrorCode = (error: unknown, ...codes: string[]): boolean =>
  error instanceof Error && "code" in error && codes.includes(String(error.code));

// Git collapses a valid nested repo into one entry but lists the files of one with a broken `.git` individually.
function createNestedRepositoryFinder(
  repoRoot: string,
): (relativePath: string) => Promise<string | undefined> {
  const hasGitEntry = new Map<string, boolean>();

  async function containsGitEntry(directory: string): Promise<boolean> {
    const known = hasGitEntry.get(directory);
    if (known !== undefined) {
      return known;
    }
    const found = await fs
      .lstat(path.join(repoRoot, directory, ".git"))
      .then(() => true)
      .catch((error: unknown) => {
        if (hasErrorCode(error, "ENOENT")) {
          return false;
        }
        throw error;
      });
    hasGitEntry.set(directory, found);
    return found;
  }

  return async (relativePath) => {
    const segments = relativePath.split("/").filter(Boolean);
    const directorySegments = relativePath.endsWith("/") ? segments : segments.slice(0, -1);
    for (let depth = 1; depth <= directorySegments.length; depth += 1) {
      const directory = directorySegments.slice(0, depth).join("/");
      if (await containsGitEntry(directory)) {
        return directory;
      }
    }
    return undefined;
  };
}

export async function copyUntrackedFiles(
  repoRoot: string,
  destinationDirectory: string,
  options?: { dryRun?: boolean; logger?: StatusLogger },
): Promise<void> {
  const logger = options?.logger ?? fallbackStatusLogger;
  const dryRun = options?.dryRun ?? false;

  const findNestedRepository = createNestedRepositoryFinder(repoRoot);
  const skippedNestedRepositories = new Set<string>();
  const untrackedEntries = new Set<string>();
  // Combine untracked-not-ignored (`--others`) and untracked-ignored (`--others --ignored`) entries.
  // These sets should be disjoint, but we dedupe defensively.
  const untrackedPaths = [
    ...git(
      "ls-files",
      "--others",
      "--exclude-standard",
      "--full-name",
      "-z", // null-separated output for safe parsing
      { cwd: repoRoot },
    )
      .split("\0")
      .filter(Boolean),
    ...git(
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--full-name",
      "-z", // null-separated output for safe parsing
      { cwd: repoRoot },
    )
      .split("\0")
      .filter(Boolean),
  ];
  for (const entry of untrackedPaths) {
    untrackedEntries.add(entry);
  }

  for (const relativePath of untrackedEntries) {
    const resolvedSourcePath = path.resolve(repoRoot, relativePath);
    if (!isPathInside(repoRoot, resolvedSourcePath)) {
      logger.warn(`Skipping ${relativePath} (path escapes repo root).`);
      continue;
    }
    if (isGeneratedPath(relativePath)) {
      continue;
    }
    const nestedRepository = await findNestedRepository(relativePath);
    if (nestedRepository !== undefined) {
      if (!skippedNestedRepositories.has(nestedRepository)) {
        skippedNestedRepositories.add(nestedRepository);
        logger.warn(`Skipping ${nestedRepository} (nested git repository).`);
      }
      continue;
    }
    const sourcePath = resolvedSourcePath;
    const destinationPath = path.join(destinationDirectory, relativePath);
    const destinationExists = await fs
      .lstat(destinationPath)
      .then(() => true)
      .catch((error: unknown) => {
        if (hasErrorCode(error, "ENOENT")) {
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
    if ((await copyLocalEntry(sourcePath, destinationPath)) === "exists") {
      logger.detail(`Skipped ${relativePath} (destination already exists).`);
      continue;
    }
    logger.detail(`Copied ${relativePath}`);
  }
}
