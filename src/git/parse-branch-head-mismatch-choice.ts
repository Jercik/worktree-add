/**
 * parse-branch-head-mismatch-choice.ts
 *
 * Pure helpers for parsing interactive choices in the branch-head mismatch flow.
 */

export type ResolutionChoice = "keep-local" | "update-local" | "abort";

export function parseResolutionChoice(
  input: string,
  defaultChoice: ResolutionChoice,
): ResolutionChoice | undefined {
  const normalized = input.trim().toLowerCase();
  if (normalized === "") return defaultChoice;
  if (normalized === "1" || normalized === "keep" || normalized === "local") {
    return "keep-local";
  }
  if (
    normalized === "2" ||
    normalized === "update" ||
    normalized === "remote"
  ) {
    return "update-local";
  }
  if (
    normalized === "3" ||
    normalized === "abort" ||
    normalized === "a" ||
    normalized === "q" ||
    normalized === "quit"
  ) {
    return "abort";
  }
  return undefined;
}
