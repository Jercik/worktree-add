export function extractDiagnosticLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const trimmed = message.trim();
  const nonEmptyLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    // Best-effort: match English prefixes; localized messages fall back to the last non-empty line.
    nonEmptyLines.find((line) => /(?:^|\s)(?:fatal:|error:)/iu.test(line)) ??
    nonEmptyLines.at(-1) ??
    trimmed
  );
}
