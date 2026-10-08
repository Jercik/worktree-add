import type { StaleStartPoint } from "../git/find-stale-start-point.js";

export function formatStaleStartPointMessage(
  newBranch: string,
  { branch, behind }: StaleStartPoint,
): string {
  const distance =
    behind === undefined ? "behind" : `${behind} ${behind === 1 ? "commit" : "commits"} behind`;
  return (
    `Local '${branch}' is ${distance} origin/${branch}.\n` +
    `Refusing to create '${newBranch}' from an outdated HEAD.\n` +
    `Update '${branch}' first (for example with 'git pull --ff-only'), then retry.\n` +
    "To create the branch from the current HEAD anyway, pass --allow-stale."
  );
}
