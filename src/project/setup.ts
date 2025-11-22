/**
 * setup.ts
 *
 * Utilities for setting up project dependencies and build artifacts
 */

import path from "node:path";
import { fileExists } from "../git/git.js";
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
): Promise<void> {
  const packageJsonPath = path.join(destinationDirectory, "package.json");
  if (!(await fileExists(packageJsonPath))) {
    return;
  }

  await installDependencies(destinationDirectory);

  // Run Next.js type generation if applicable
  if (await isNextProject(destinationDirectory)) {
    console.log("➤ Checking Next.js CLI typegen support …");
    const hasTypegenSupport =
      await isNextTypegenSupported(destinationDirectory);
    if (hasTypegenSupport) {
      console.log("➤ Running next typegen …");
      await runPackageManagerBinary(destinationDirectory, "next", ["typegen"]);
    } else {
      console.warn(
        "! Skipping next typegen: installed Next.js CLI does not support this command.",
      );
    }
  }
}
