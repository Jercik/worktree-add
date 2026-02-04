export function getUnsafeAppNameReason(appName: string): string | undefined {
  for (const character of appName) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return "contains control characters";
    }
  }

  return undefined;
}
