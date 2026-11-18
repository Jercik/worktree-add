import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";

async function tryMacClone(source: string, destination: string): Promise<boolean> {
  const entry = await fs.lstat(source);
  if (!entry.isFile()) {
    return false;
  }

  // Node's COPYFILE_FICLONE does not use clonefile on macOS.
  try {
    const { reflinkFile } = await import("@reflink/reflink");
    await reflinkFile(source, destination);
    return true;
  } catch {
    // Cloning is optional. The exclusive copy reports any error that also prevents copying.
    return false;
  }
}

export async function copyLocalEntry(
  source: string,
  destination: string,
): Promise<"copied" | "exists"> {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try {
    if (process.platform === "darwin" && (await tryMacClone(source, destination))) {
      return "copied";
    }

    await fs.cp(source, destination, {
      recursive: true,
      errorOnExist: true,
      force: false,
      // oxlint-disable-next-line no-bitwise -- copy modes are a bitmask.
      mode: constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE,
      verbatimSymlinks: true,
    });
    return "copied";
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "EEXIST" || error.code === "ERR_FS_CP_EEXIST")
    ) {
      return "exists";
    }
    throw error;
  }
}
