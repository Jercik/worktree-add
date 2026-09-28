import type { CreatedBranch } from "./create-worktree.js";
import { git } from "./git.js";

export function deleteCreatedBranch(branch: CreatedBranch): void {
  // The expected old value makes the delete fail if the branch moved after it was read.
  git("update-ref", "-d", branch.ref, branch.commit);

  // `--remove-section` fails on a missing section; a dotted remainder belongs to a longer branch name.
  const configPrefix = `branch.${branch.name}.`;
  const hasConfig = git("config", "--local", "--name-only", "--list")
    .split("\n")
    .some((key) => key.startsWith(configPrefix) && !key.slice(configPrefix.length).includes("."));
  if (hasConfig) {
    git("config", "--local", "--remove-section", `branch.${branch.name}`);
  }
}
