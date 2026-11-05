type BranchRelation = "ahead" | "behind" | "diverged" | "even";

export function classifyBranchDivergence(counts: {
  ahead: number;
  behind: number;
}): BranchRelation {
  if (counts.ahead > 0 && counts.behind > 0) {
    return "diverged";
  }
  if (counts.behind > 0) {
    return "behind";
  }
  return counts.ahead > 0 ? "ahead" : "even";
}
