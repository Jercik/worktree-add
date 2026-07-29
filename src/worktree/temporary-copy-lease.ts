import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";

const temporaryCopyLeaseFile = "owner.json";
const maximumTemporaryCopyLeaseBytes = 1024;

interface TemporaryCopyLease {
  readonly kind: "copy-stage";
  readonly owner: "worktree-add";
  readonly pid: number;
}

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

const isSameRegularFile = (
  expected: { readonly dev: number; readonly ino: number },
  current: Awaited<ReturnType<typeof fs.lstat>>,
): boolean =>
  !current.isSymbolicLink() &&
  current.isFile() &&
  current.dev === expected.dev &&
  current.ino === expected.ino;

async function readBoundedFile(handle: fs.FileHandle): Promise<string | undefined> {
  const buffer = Buffer.alloc(maximumTemporaryCopyLeaseBytes + 1);
  let bytesRead = 0;
  while (bytesRead < buffer.length) {
    const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
    if (result.bytesRead === 0) {
      break;
    }
    bytesRead += result.bytesRead;
  }
  return bytesRead <= maximumTemporaryCopyLeaseBytes
    ? buffer.subarray(0, bytesRead).toString("utf8")
    : undefined;
}

export async function readTemporaryCopyLeasePid(
  temporaryDirectory: string,
): Promise<number | undefined> {
  let handle: fs.FileHandle | undefined;
  try {
    const leasePath = path.join(temporaryDirectory, temporaryCopyLeaseFile);
    const initialPathStat = await fs.lstat(leasePath);
    if (initialPathStat.isSymbolicLink() || !initialPathStat.isFile()) {
      return undefined;
    }
    // eslint-disable-next-line no-bitwise -- Node file-open flags are bit masks.
    const flags = (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
    handle = await fs.open(leasePath, flags);
    const leaseStat = await handle.stat();
    const currentPathStat = await fs.lstat(leasePath);
    if (
      !leaseStat.isFile() ||
      leaseStat.size > maximumTemporaryCopyLeaseBytes ||
      !isSameRegularFile(leaseStat, initialPathStat) ||
      !isSameRegularFile(leaseStat, currentPathStat)
    ) {
      return undefined;
    }
    const contents = await readBoundedFile(handle);
    if (contents === undefined) {
      return undefined;
    }
    const finalPathStat = await fs.lstat(leasePath);
    if (!isSameRegularFile(leaseStat, finalPathStat)) {
      return undefined;
    }
    const value: unknown = JSON.parse(contents);
    return isTemporaryCopyLease(value) ? value.pid : undefined;
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function writeTemporaryCopyLease(temporaryDirectory: string): Promise<void> {
  const lease: TemporaryCopyLease = {
    kind: "copy-stage",
    owner: "worktree-add",
    pid: process.pid,
  };
  await fs.writeFile(
    path.join(temporaryDirectory, temporaryCopyLeaseFile),
    `${JSON.stringify(lease)}\n`,
    { flag: "wx", mode: 0o600 },
  );
}
