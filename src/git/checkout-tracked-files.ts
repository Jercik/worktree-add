import { cloneTrackedFiles } from "../worktree/clone-tracked-files.js";
import { git, runGitRaw } from "./git.js";
import { trackedCloneEntries } from "./tracked-clone-entries.js";
import type { TrackedCloneEntry } from "./tracked-clone-entries.js";

export function canSeedCheckout(sourceRoot: string): boolean {
  // Splitting worktree add and reset changes when these hooks run and what they see.
  return (
    process.platform === "darwin" &&
    process.env.GIT_INDEX_FILE === undefined &&
    ["post-checkout", "post-index-change", "reference-transaction"].every(
      (event) => runGitRaw(["hook", "list", event], { cwd: sourceRoot }).status === 1,
    )
  );
}

async function seedIndex(sourceRoot: string, destination: string): Promise<number> {
  let entries: TrackedCloneEntry[];
  let admin: string;
  try {
    const commit = git("rev-parse", "--verify", "HEAD", { cwd: destination });
    if (!canSeedCheckout(destination) || git("replace", "--list", { cwd: destination }) !== "") {
      return 0;
    }
    entries = trackedCloneEntries(sourceRoot, destination, commit);
    admin = git("rev-parse", "--absolute-git-dir", { cwd: destination });
  } catch {
    return 0;
  }
  const published = await cloneTrackedFiles(sourceRoot, destination, admin, entries);
  if (published.length > 0) {
    const input = published
      .map((entry) => `${entry.executable ? "100755" : "100644"} ${entry.oid}\t${entry.path}\0`)
      .join("");
    const indexGit = ["-c", "core.hooksPath=/dev/null", "update-index"];
    git(...indexGit, "-z", "--index-info", { cwd: destination, input });
    git(...indexGit, "-q", "--refresh", { cwd: destination });
  }
  return published.length;
}

export async function checkoutTrackedFiles(
  sourceRoot: string,
  destination: string,
): Promise<number> {
  const shared = await seedIndex(sourceRoot, destination);
  // --merge keeps a published file even if someone edited it while Git was filling the index.
  git("reset", shared === 0 ? "--hard" : "--merge", "--no-recurse-submodules", "HEAD", {
    cwd: destination,
  });
  return shared;
}
