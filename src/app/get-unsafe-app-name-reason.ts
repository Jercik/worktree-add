/**
 * Defense-in-depth filter for app names passed to the `open` package.
 *
 * This is not intended as shell-injection mitigation (the `open` package uses
 * `spawn()` without `shell: true`). These checks primarily prevent confusing or
 * unsafe terminal output (control characters) and reject a few extremely unlikely
 * characters as an extra guardrail.
 */
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
