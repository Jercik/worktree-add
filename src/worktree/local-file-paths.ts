import * as fs from "node:fs/promises";
import path from "node:path";

declare const copyFileNameBrand: unique symbol;
export type CopyFileName = string & { readonly [copyFileNameBrand]: true };

export interface DirectoryIdentity {
  readonly dev: number;
  readonly ino: number;
}

export const isAlreadyExists = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "EEXIST";

export const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const containsControlCharacter = (fileName: string): boolean => {
  for (let index = 0; index < fileName.length; index += 1) {
    const codePoint = fileName.codePointAt(index);
    if (
      codePoint !== undefined &&
      (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    ) {
      return true;
    }
  }
  return false;
};

const parseCopyFileName = (fileName: string): CopyFileName => {
  if (
    fileName.length === 0 ||
    fileName === "." ||
    fileName === ".." ||
    containsControlCharacter(fileName) ||
    fileName.includes(":") ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    path.isAbsolute(fileName) ||
    path.win32.isAbsolute(fileName)
  ) {
    throw new Error(`--copy-file '${fileName}' must be a single file name in the repository root.`);
  }
  return fileName as CopyFileName;
};

export function parseCopyFileNames(fileNames: readonly string[]): CopyFileName[] {
  return [...new Set(fileNames.map((fileName) => parseCopyFileName(fileName)))];
}

export const getRootFilePath = (directory: string, fileName: CopyFileName): string =>
  path.join(path.resolve(directory), fileName);

export async function ensureRegularDirectory(
  directory: string,
  description: string,
): Promise<DirectoryIdentity> {
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${description} '${directory}' is not a regular directory.`);
  }
  return { dev: stat.dev, ino: stat.ino };
}

export async function ensureSameRegularDirectory(
  directory: string,
  description: string,
  expectedIdentity: DirectoryIdentity,
): Promise<void> {
  const identity = await ensureRegularDirectory(directory, description);
  if (identity.dev !== expectedIdentity.dev || identity.ino !== expectedIdentity.ino) {
    throw new Error(`${description} '${directory}' changed during local file copying.`);
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
