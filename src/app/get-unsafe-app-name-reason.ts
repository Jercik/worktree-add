/**
 * Defense-in-depth filter for app names passed to the `open` package.
 *
 * This is not intended as shell-injection mitigation. In `open@11` (currently
 * used by this repo), the implementation uses `child_process.spawn()` without
 * `shell: true`, but the exact subprocess differs by platform (macOS: `open -a`,
 * Linux: usually `xdg-open` unless an explicit app is provided, Windows:
 * PowerShell). This comment is informational, not a guarantee — treat this
 * filter as a UX/diagnostics guardrail rather than a security boundary.
 */
export function getUnsafeAppNameReason(appName: string): string | undefined {
  for (const character of appName) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;

    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return "contains control characters";
    }
  }

  return undefined;
}
