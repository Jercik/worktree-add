/**
 * Defense-in-depth filter for app names passed to the `open` package.
 *
 * This is not intended as shell-injection mitigation. The `open` package uses
 * `child_process.spawn()` without `shell: true`; on Windows it spawns PowerShell
 * and escapes/encodes arguments, on macOS it invokes `open -a`, and on Linux it
 * spawns the app directly. These checks primarily prevent confusing/unsafe
 * terminal output (control characters) and reject a few extremely unlikely
 * characters as an extra guardrail (not a security boundary).
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
