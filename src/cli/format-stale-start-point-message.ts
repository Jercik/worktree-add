import type { StaleStartPoint } from "../git/find-stale-start-point.js";

const pluralizeCommits = (count: number): string =>
  `${count} ${count === 1 ? "commit" : "commits"}`;

function describeStaleness({ branch, counts }: StaleStartPoint): {
  readonly state: string;
  readonly remedy: string;
} {
  if (counts === undefined) {
    return {
      state: `Local '${branch}' is behind origin/${branch}.`,
      remedy: `Update '${branch}' from origin/${branch} first, then retry.`,
    };
  }
  const behind = pluralizeCommits(counts.behind);
  if (counts.ahead === 0) {
    return {
      state: `Local '${branch}' is ${behind} behind origin/${branch}.`,
      remedy: `Update '${branch}' first (for example with 'git pull --ff-only'), then retry.`,
    };
  }
  return {
    state: `Local '${branch}' is ${behind} behind origin/${branch} and has ${pluralizeCommits(counts.ahead)} that origin/${branch} lacks.`,
    remedy: `Rebase or merge '${branch}' onto origin/${branch} first (for example with 'git pull --rebase'), then retry.`,
  };
}

export function formatStaleStartPointMessage(
  newBranch: string,
  staleStartPoint: StaleStartPoint,
): string {
  const { state, remedy } = describeStaleness(staleStartPoint);
  return (
    `${state}\n` +
    `Refusing to create '${newBranch}' from an outdated HEAD.\n` +
    `${remedy}\n` +
    "To create the branch from the current HEAD anyway, pass --allow-stale."
  );
}
