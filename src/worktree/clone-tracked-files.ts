import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { reflinkFile as ReflinkFile } from "@reflink/reflink";
import type { TrackedCloneEntry } from "../git/tracked-clone-entries.js";

type TrackedClone = TrackedCloneEntry & { scratchPath: string };

async function regularSource(root: string, relativePath: string): Promise<string | undefined> {
  const components = relativePath.split("/");
  let current = root;
  try {
    for (const [index, component] of components.entries()) {
      current = path.join(current, component);
      const entry = await fs.lstat(current);
      if (index === components.length - 1 ? !entry.isFile() : !entry.isDirectory()) {
        return undefined;
      }
    }
    return current;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["ENOENT", "ENOTDIR", "EACCES"].includes(String(error.code))
    ) {
      return undefined;
    }
    throw error;
  }
}

async function blobMatches(file: string, oid: string): Promise<boolean> {
  const algorithm = oid.length === 40 ? "sha1" : "sha256";
  const { size } = await fs.stat(file);
  const hash = createHash(algorithm).update(`blob ${size}\0`);
  for await (const chunk of createReadStream(file) as AsyncIterable<Buffer>) {
    hash.update(chunk);
  }
  return hash.digest("hex") === oid;
}

async function prepareTrackedClones(
  sourceRoot: string,
  scratchDirectory: string,
  entries: readonly TrackedCloneEntry[],
  reflinkFile: typeof ReflinkFile,
): Promise<TrackedClone[]> {
  const clones: TrackedClone[] = [];
  for (const [index, entry] of entries.entries()) {
    const source = await regularSource(sourceRoot, entry.path);
    if (source === undefined) {
      continue;
    }
    const scratchPath = path.join(scratchDirectory, String(index));
    try {
      await reflinkFile(source, scratchPath);
    } catch {
      continue;
    }
    clones.push({ ...entry, scratchPath });
  }
  if (clones.length === 0) {
    return [];
  }

  // clonefile carries xattrs and BSD flags that a Git checkout would not create.
  // BSD find matches flags exactly: nouchg by itself is the zero-flags mask.
  const stdout = execFileSync(
    "/usr/bin/find",
    [
      scratchDirectory,
      "-mindepth",
      "1",
      "-maxdepth",
      "1",
      "(",
      "-xattr",
      "-o",
      "!",
      "-flags",
      "nouchg",
      ")",
      "-print0",
    ],
    {
      encoding: "utf8",
      maxBuffer: clones.reduce(
        (bytes, clone) => bytes + Buffer.byteLength(clone.scratchPath) + 1,
        0,
      ),
    },
  );
  const unsafe = new Set(stdout.split("\0"));
  // The mode of a newly created file reflects the process umask, not the source permissions.
  const modePath = path.join(scratchDirectory, ".mode");
  const modeFile = await fs.open(modePath, "wx", 0o777);
  const { mode } = await modeFile.stat();
  await modeFile.close();
  await fs.unlink(modePath);
  const prepared: TrackedClone[] = [];
  for (const clone of clones) {
    const stat = await fs.lstat(clone.scratchPath);
    if (unsafe.has(clone.scratchPath) || !stat.isFile()) {
      continue;
    }
    await fs.chmod(clone.scratchPath, 0o600);
    if (!(await blobMatches(clone.scratchPath, clone.oid))) {
      continue;
    }
    // oxlint-disable-next-line no-bitwise -- apply the process creation mask to Git's file mode.
    await fs.chmod(clone.scratchPath, (clone.executable ? 0o777 : 0o666) & mode);
    // A fresh checkout would not inherit the source file's modification time.
    const now = new Date();
    await fs.utimes(clone.scratchPath, now, now);
    prepared.push(clone);
  }
  return prepared;
}

async function publishTrackedClones(
  destinationRoot: string,
  tree: string,
  clones: readonly TrackedClone[],
  reflinkFile: typeof ReflinkFile,
): Promise<TrackedClone[]> {
  if (clones.length === 0) {
    return [];
  }
  // Cloning one absent top-level name avoids replacing files or following a destination symlink.
  const groups = new Map<string, TrackedClone[]>();
  for (const clone of clones) {
    const top = clone.path.split("/").shift() ?? clone.path;
    const group = groups.get(top);
    if (group) {
      group.push(clone);
    } else {
      groups.set(top, [clone]);
    }
  }

  const published: TrackedClone[] = [];
  for (const [top, group] of groups) {
    try {
      for (const clone of group) {
        const staged = path.join(tree, clone.path);
        await fs.mkdir(path.dirname(staged), { recursive: true });
        await fs.link(clone.scratchPath, staged);
      }
      await reflinkFile(path.join(tree, top), path.join(destinationRoot, top));
      for (const clone of group) {
        published.push(clone);
      }
    } catch {
      continue;
    }
  }
  return published;
}

async function removeSnapshots(scratch: string): Promise<void> {
  try {
    await fs.rm(scratch, { recursive: true, force: true });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EPERM")) {
      throw error;
    }
    // clonefile also copies immutable and append-only flags onto rejected snapshots.
    execFileSync("/usr/bin/find", [
      scratch,
      "-flags",
      "+uchg,uappnd",
      "-exec",
      "/usr/bin/chflags",
      "-h",
      "nouchg,nouappnd",
      "{}",
      "+",
    ]);
    await fs.rm(scratch, { recursive: true, force: true });
  }
}

export async function cloneTrackedFiles(
  sourceRoot: string,
  destinationRoot: string,
  admin: string,
  entries: readonly TrackedCloneEntry[],
): Promise<TrackedCloneEntry[]> {
  if (entries.length === 0) {
    return [];
  }
  const destination = await fs.lstat(destinationRoot);
  if (!destination.isDirectory()) {
    throw new Error(`Worktree root is not a directory: ${destinationRoot}`);
  }
  let scratch: string;
  let reflinkFile: typeof ReflinkFile;
  try {
    if (execFileSync("/usr/bin/find", [destinationRoot, "-prune", "-acl", "-print"]).length > 0) {
      return [];
    }
    ({ reflinkFile } = await import("@reflink/reflink"));
    scratch = await fs.mkdtemp(path.join(admin, "clone-"));
  } catch {
    return [];
  }

  try {
    let snapshots: TrackedClone[];
    let tree: string;
    try {
      snapshots = await prepareTrackedClones(sourceRoot, scratch, entries, reflinkFile);
      tree = await fs.mkdtemp(path.join(scratch, "publish-"));
    } catch {
      return [];
    }
    return await publishTrackedClones(destinationRoot, tree, snapshots, reflinkFile);
  } finally {
    await removeSnapshots(scratch);
  }
}
