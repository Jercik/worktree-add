import * as fs from "node:fs/promises";
import path from "node:path";

export const isAlreadyExists = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "EEXIST";

export const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const validateCopyFileName = (fileName: string): void => {
  if (
    fileName.length === 0 ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    path.isAbsolute(fileName) ||
    path.win32.isAbsolute(fileName)
  ) {
    throw new Error(`--copy-file '${fileName}' must be a single file name in the repository root.`);
  }
};

export function validateCopyFilePaths(fileNames: readonly string[]): void {
  for (const fileName of fileNames) {
    validateCopyFileName(fileName);
  }
}

export const getRootFilePath = (directory: string, fileName: string): string => {
  validateCopyFileName(fileName);
  return path.join(path.resolve(directory), fileName);
};

export async function ensureRegularDirectory(
  directory: string,
  description: string,
): Promise<void> {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${description} '${directory}' is not a regular directory.`);
  }
}

export async function destinationExists(destinationPath: string): Promise<boolean> {
  try {
    await fs.lstat(destinationPath);
    return true;
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
}
