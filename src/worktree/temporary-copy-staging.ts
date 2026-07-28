import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import type { StatusLogger } from "../output/create-status-logger.js";
import { isNotFound } from "./local-file-paths.js";

const temporaryCopyDirectoryPrefix = ".worktree-add-copy-";
const temporaryCopyLeaseFile = "owner.json";

interface TemporaryCopyLease {
  readonly kind: "copy-stage";
  readonly owner: "worktree-add";
  readonly pid: number;
}

const temporaryCopyOwnerPid = (directoryName: string): number | undefined => {
  const match = /^\.worktree-add-copy-(?<pid>[1-9]\d*)-/u.exec(directoryName);
  const pid = Number(match?.groups?.pid);
  return Number.isSafeInteger(pid) ? pid : undefined;
};

const isTemporaryCopyLease = (value: unknown): value is TemporaryCopyLease =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  value.kind === "copy-stage" &&
  "owner" in value &&
  value.owner === "worktree-add" &&
  "pid" in value &&
  typeof value.pid === "number" &&
  Number.isSafeInteger(value.pid);

async function readTemporaryCopyLease(temporaryDirectory: string): Promise<number | undefined> {
  try {
    const contents = await fs.readFile(
      path.join(temporaryDirectory, temporaryCopyLeaseFile),
      "utf8",
    );
    const value: unknown = JSON.parse(contents);
    return isTemporaryCopyLease(value) ? value.pid : undefined;
  } catch {
    return undefined;
  }
}

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

async function removeEmptyUnleasedTemporaryCopy(
  temporaryDirectory: string,
  logger: StatusLogger,
): Promise<void> {
  try {
    await fs.rmdir(temporaryDirectory);
  } catch (error: unknown) {
    if (
      isNotFound(error) ||
      (error instanceof Error &&
        "code" in error &&
        (error.code === "ENOTEMPTY" || error.code === "EEXIST"))
    ) {
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
    const leasePid = await readTemporaryCopyLease(temporaryDirectory);
    if (processIsRunning(ownerPid)) {
      continue;
    }
    if (leasePid === undefined) {
      await removeEmptyUnleasedTemporaryCopy(temporaryDirectory, logger);
      continue;
    }
    if (leasePid !== ownerPid) {
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
  const lease: TemporaryCopyLease = {
    kind: "copy-stage",
    owner: "worktree-add",
    pid: process.pid,
  };
  try {
    await fs.writeFile(
      path.join(temporaryDirectory, temporaryCopyLeaseFile),
      `${JSON.stringify(lease)}\n`,
      { flag: "wx", mode: 0o600 },
    );
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
