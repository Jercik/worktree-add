import path from "node:path";

export function isPathInside(directory: string, candidate: string): boolean {
  const relativePath = path.relative(directory, candidate);
  return (
    !path.isAbsolute(relativePath) &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`)
  );
}
