export function getUnsafeAppNameReason(appName: string): string | undefined {
  if (appName.includes(";")) return "contains ';'";
  if (appName.includes("|")) return "contains '|'";
  if (appName.includes("`")) return "contains '`'";

  for (const character of appName) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return "contains control characters";
    }
  }

  return undefined;
}
