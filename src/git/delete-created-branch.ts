import type { CreatedBranch } from "./create-worktree.js";
import { git } from "./git.js";

export function deleteCreatedBranch(branch: CreatedBranch): void {
  // The expected old value makes the delete fail if the branch moved after it was read.
  git("update-ref", "-d", branch.ref, branch.commit);
}
