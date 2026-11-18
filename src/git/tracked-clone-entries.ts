import { spawnSync } from "node:child_process";

export interface TrackedCloneEntry {
  readonly path: string;
  readonly oid: string;
  readonly executable: boolean;
}

function runGit(cwd: string, args: string[], input?: string): Buffer | undefined {
  const result = spawnSync("git", args, {
    cwd,
    input,
    maxBuffer: 100 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return result.status === 0 ? result.stdout : undefined;
}

function config(cwd: string, key: string, boolean = false): string | null | undefined {
  const result = spawnSync("git", ["config", ...(boolean ? ["--type=bool"] : []), "--get", key], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.status === 1) {
    return null;
  }
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim().toLowerCase();
}

function unambiguousTree(entries: string[]): boolean {
  const names = new Set<string>();
  for (const entry of entries) {
    const name = entry
      .slice(entry.indexOf("\t") + 1)
      .normalize("NFKC")
      .replaceAll(/\p{Default_Ignorable_Code_Point}/gu, "")
      .toUpperCase()
      .toLowerCase();
    if (
      names.has(name) ||
      name
        .split("/")
        .some(
          (part) => ["", ".", ".."].includes(part) || /^(?:\.git|git~\d)(?:[. ]*|:.*)$/u.test(part),
        )
    ) {
      return false;
    }
    names.add(name);
  }
  return true;
}

function records(output: Buffer): string[] | undefined {
  const decoded = output.toString("utf8");
  if (!Buffer.from(decoded).equals(output) || (decoded !== "" && !decoded.endsWith("\0"))) {
    return undefined;
  }
  return decoded === "" ? [] : decoded.slice(0, -1).split("\0");
}

export function trackedCloneEntries(
  sourceRoot: string,
  destinationRoot: string,
  targetCommit: string,
): TrackedCloneEntry[] {
  if (!/^[a-f\d]{40}(?:[a-f\d]{24})?$/u.test(targetCommit)) {
    return [];
  }
  const sourceSparse = config(sourceRoot, "core.sparseCheckout", true);
  const sparse = config(destinationRoot, "core.sparseCheckout", true);
  const autoCrlf = config(destinationRoot, "core.autocrlf", true);
  const eol = config(destinationRoot, "core.eol");
  const nativeLf = process.platform === "darwin" || process.platform === "linux";
  if (
    sourceSparse === undefined ||
    (sourceSparse !== null && sourceSparse !== "false") ||
    sparse === undefined ||
    (sparse !== null && sparse !== "false") ||
    autoCrlf === undefined ||
    (autoCrlf !== null && autoCrlf !== "false") ||
    eol === undefined ||
    (eol !== "lf" && !((eol === null || eol === "native") && nativeLf))
  ) {
    return [];
  }

  const sourceOutput = runGit(sourceRoot, ["ls-files", "--stage", "-z"]);
  const targetOutput = runGit(destinationRoot, [
    "ls-tree",
    "-r",
    "-t",
    "-z",
    "--full-tree",
    targetCommit,
  ]);
  if (!sourceOutput || !targetOutput) {
    return [];
  }
  const sourceRecords = records(sourceOutput);
  const targetRecords = records(targetOutput);
  if (!sourceRecords || !targetRecords || !unambiguousTree(targetRecords)) {
    return [];
  }

  const sourcePaths = new Set<string>();
  for (const entry of sourceRecords) {
    const match = /^(?:100644|100755) [a-f\d]+ 0\t(?<path>[\s\S]+)$/u.exec(entry);
    if (match?.groups?.path) {
      sourcePaths.add(match.groups.path);
    }
  }
  const candidates: TrackedCloneEntry[] = [];
  for (const entry of targetRecords) {
    const match = /^(?<mode>100644|100755) blob (?<oid>[a-f\d]+)\t(?<path>[\s\S]+)$/u.exec(entry);
    if (
      match?.groups?.mode &&
      match.groups.oid &&
      match.groups.path &&
      sourcePaths.has(match.groups.path)
    ) {
      candidates.push({
        path: match.groups.path,
        oid: match.groups.oid,
        executable: match.groups.mode === "100755",
      });
    }
  }
  if (candidates.length === 0) {
    return [];
  }

  const output = runGit(
    destinationRoot,
    ["check-attr", `--source=${targetCommit}`, "-z", "--stdin", "--all"],
    `${candidates.map((entry) => entry.path).join("\0")}\0`,
  );
  if (!output) {
    return [];
  }
  const values = records(output);
  if (!values || values.length % 3 !== 0) {
    return [];
  }
  const rejected = new Set<string>();
  const paths = new Set(candidates.map((entry) => entry.path));
  for (let index = 0; index < values.length; index += 3) {
    const path = values[index];
    const attribute = values[index + 1];
    const value = values[index + 2];
    if (path === undefined || attribute === undefined || value === undefined || !paths.has(path)) {
      return [];
    }
    if (
      (attribute === "text" && !["set", "auto", "unset"].includes(value)) ||
      (attribute === "crlf" && !["set", "input", "unset"].includes(value)) ||
      (attribute === "eol" && value !== "lf") ||
      ["ident", "filter", "working-tree-encoding"].includes(attribute)
    ) {
      rejected.add(path);
    }
  }
  return candidates.filter((candidate) => !rejected.has(candidate.path));
}
