import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import type { StatusLogger } from "../output/create-status-logger.js";
import { isNotFound } from "./local-file-paths.js";
import { readTemporaryCopyLeasePid, writeTemporaryCopyLease } from "./temporary-copy-lease.js";

const temporaryCopyDirectoryPrefix = ".worktree-add-copy-";

const temporaryCopyOwnerPid = (directoryName: string): number | undefined => {
  const match = /^\.worktree-add-copy-(?<pid>[1-9]\d*)-/u.exec(directoryName);
  const pid = Number(match?.groups?.pid);
  return Number.isSafeInteger(pid) ? pid : undefined;
};

const processIsRunning = (pid: number): boolean => {
  if (pid === process.pid) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
};

const warnPreservedUnverifiedTemporaryCopy = (
  temporaryDirectory: string,
  logger: StatusLogger,
): void => {
  logger.warn(
    `Preserved unverified local copy staging directory at ${JSON.stringify(temporaryDirectory)}. If no worktree-add process is running, remove it manually.`,
  );
};

async function removeEmptyUnleasedTemporaryCopy(
  temporaryDirectory: string,
  logger: StatusLogger,
): Promise<void> {
  try {
    await fs.rmdir(temporaryDirectory);
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return;
    }
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOTEMPTY" || error.code === "EEXIST")
    ) {
      warnPreservedUnverifiedTemporaryCopy(temporaryDirectory, logger);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to remove empty local copy staging directory: ${message}`);
  }
}

export async function removeStaleTemporaryCopies(
  stagingParent: string,
  logger: StatusLogger,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(stagingParent, { withFileTypes: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to inspect stale local copy staging directories: ${message}`);
    return;
  }
  for (const entry of entries) {
    const ownerPid = entry.isDirectory() ? temporaryCopyOwnerPid(entry.name) : undefined;
    if (ownerPid === undefined) {
      continue;
    }
    const temporaryDirectory = path.join(stagingParent, entry.name);
    if (processIsRunning(ownerPid)) {
      continue;
    }
    const leasePid = await readTemporaryCopyLeasePid(temporaryDirectory);
    if (leasePid === undefined) {
      await removeEmptyUnleasedTemporaryCopy(temporaryDirectory, logger);
      continue;
    }
    if (leasePid !== ownerPid) {
      warnPreservedUnverifiedTemporaryCopy(temporaryDirectory, logger);
      continue;
    }
    try {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    } catch (error: unknown) {
      if (isNotFound(error)) {
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to remove stale local copy staging directory: ${message}`);
    }
  }
}

export async function createTemporaryCopyDirectory(stagingParent: string): Promise<string> {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(stagingParent, `${temporaryCopyDirectoryPrefix}${process.pid}-`),
  );
  try {
    await writeTemporaryCopyLease(temporaryDirectory);
    return temporaryDirectory;
  } catch (error: unknown) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function removeTemporaryCopy(
  temporaryDirectory: string,
  fileName: string,
  logger: StatusLogger,
): Promise<void> {
  try {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to remove temporary copy of ${fileName}: ${message}`);
  }
}
