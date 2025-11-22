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

/**
 * Copy untracked files from source to destination, excluding ignored patterns
 */
export async function copyUntrackedFiles(
  repoRoot: string,
  destinationDirectory: string,
): Promise<void> {
  const extraIgnoredRegexes = EXTRA_IGNORED_PATTERNS.map((pattern) =>
    globToRegExp(pattern),
  );

  const untrackedEntries = git(
    "ls-files",
    "--others", // untracked files
    "--ignored", // ignored files
    "--exclude-standard", // respect .gitignore rules
    "-z", // null-separated output for safe parsing
  )
    .split("\0")
    .filter(Boolean);

  for (const relativePath of untrackedEntries) {
    const posixPath = toPosixPath(relativePath);
    if (extraIgnoredRegexes.some((regex) => regex.test(posixPath))) {
      continue;
    }
    const sourcePath = path.resolve(repoRoot, relativePath);
    const destinationPath = path.join(destinationDirectory, relativePath);
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.cp(sourcePath, destinationPath, {
      recursive: true,
      errorOnExist: false,
    });
    console.log(`  • copied ${relativePath}`);
  }
}
