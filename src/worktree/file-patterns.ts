/**
 * file-patterns.ts
 *
 * Shared utilities for worktree file selection
 */

// Patterns for untracked files that should NOT be copied to new worktrees
export const EXTRA_IGNORED_PATTERNS: string[] = [
  "node_modules/**",
  ".next/**",
  ".nuxt/**",
  ".output/**",
  "dist/**",
  "build/**",
  "**/*.tsbuildinfo",
  ".turbo/**",
  ".cache/**",
  "coverage/**",
  ".venv/**",
  "venv/**",
  "__pycache__/**",
  ".pytest_cache/**",
  "target/**", // Rust
  ".dart_tool/**", // Dart
];

const escapeForRegExp = (value: string): string =>
  value.replaceAll(/[\\^$*+?.()|[\]{}]/gu, String.raw`\$&`);

export const globToRegExp = (globPattern: string): RegExp => {
  let regexBody = "";
  for (let index = 0; index < globPattern.length; index += 1) {
    const character = globPattern.charAt(index);
    if (character === "*") {
      const nextCharacter = globPattern.charAt(index + 1);
      if (nextCharacter === "*") {
        regexBody += ".*";
        index += 1;
      } else {
        regexBody += "[^/]*";
      }
      continue;
    }
    if (character === "?") {
      regexBody += "[^/]";
      continue;
    }
    if (character === "/") {
      regexBody += String.raw`\/`;
      continue;
    }
    regexBody += escapeForRegExp(character);
  }
  return new RegExp(`^${regexBody}$`, "u");
};

export const toPosixPath = (value: string): string =>
  value.replaceAll("\\", "/");
