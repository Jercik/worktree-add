const generatedDirectoryNames = new Set([
  "node_modules",
  ".next",
  ".nuxt",
  ".output",
  "dist",
  "build",
  ".turbo",
  ".cache",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".pytest_cache",
  "target", // Rust
  ".dart_tool", // Dart
]);

export function isGeneratedPath(relativePath: string): boolean {
  const segments = relativePath.split("/").filter(Boolean);
  const fileName = segments.at(-1);
  if (fileName?.endsWith(".tsbuildinfo") === true) {
    return true;
  }
  const directorySegments = relativePath.endsWith("/") ? segments : segments.slice(0, -1);
  return directorySegments.some((segment) => generatedDirectoryNames.has(segment));
}
