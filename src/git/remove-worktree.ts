import { git } from "./git.js";

export function removeWorktree(destinationDirectory: string): void {
  git("worktree", "remove", "--force", "--", destinationDirectory);
}
