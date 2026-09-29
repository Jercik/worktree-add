import { isDeepStrictEqual } from "node:util";
import { git, readBranchConfig } from "./git.js";
import type { BranchConfig } from "./parse-branch-config.js";

export function restoreBranchConfig(branchName: string, preexistingConfig: BranchConfig): void {
  const currentConfig = readBranchConfig(branchName);
  if (preexistingConfig.size === 0) {
    if (currentConfig.size > 0) {
      // The same removal `git branch -D` performs.
      git("config", "--local", "--remove-section", `branch.${branchName}`);
    }
    return;
  }
  // `--track` replaces or appends to tracking keys that predate the branch.
  for (const key of new Set([...currentConfig.keys(), ...preexistingConfig.keys()])) {
    const preexistingValues = preexistingConfig.get(key) ?? [];
    if (isDeepStrictEqual(currentConfig.get(key) ?? [], preexistingValues)) {
      continue;
    }
    const [firstValue, ...otherValues] = preexistingValues;
    if (firstValue === undefined) {
      git("config", "--local", "--unset-all", key);
      continue;
    }
    // `--replace-all` swaps the values in one write, so a failure never leaves the key unset.
    git("config", "--local", "--replace-all", key, firstValue);
    for (const value of otherValues) {
      git("config", "--local", "--add", key, value);
    }
  }
}
