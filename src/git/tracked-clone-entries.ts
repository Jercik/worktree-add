import { git, gitBytes } from "./git.js";

export interface TrackedCloneEntry {
  readonly path: string;
  readonly oid: string;
  readonly executable: boolean;
}

function falseOrUnset(cwd: string, key: string): boolean {
  return git("config", "--type=bool", "--default=false", "--get", key, { cwd }) === "false";
}

function checkoutUsesLf(cwd: string): boolean {
  const value = git("config", "--default=native", "--get", "core.eol", { cwd }).toLowerCase();
  return value === "lf" || (value === "native" && process.platform !== "win32");
}

function unambiguousTree(entries: string[]): boolean {
  // An alias could make a published path collide with another entry or Git's admin directory.
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
  if (
    !falseOrUnset(sourceRoot, "core.sparseCheckout") ||
    !falseOrUnset(destinationRoot, "core.sparseCheckout") ||
    !falseOrUnset(destinationRoot, "core.autocrlf") ||
    !checkoutUsesLf(destinationRoot)
  ) {
    return [];
  }

  const sourceRecords = records(gitBytes(["ls-files", "--stage", "-z"], { cwd: sourceRoot }));
  const targetRecords = records(
    gitBytes(["ls-tree", "-r", "-t", "-z", "--full-tree", targetCommit], { cwd: destinationRoot }),
  );
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

  const input = candidates.map((entry) => `${entry.path}\0`).join("");
  const values = records(
    gitBytes(["check-attr", `--source=${targetCommit}`, "-z", "--stdin", "--all"], {
      cwd: destinationRoot,
      input,
    }),
  );
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
    if (!checkoutPreservesBytes(attribute, value)) {
      rejected.add(path);
    }
  }
  return candidates.filter((candidate) => !rejected.has(candidate.path));
}

function checkoutPreservesBytes(attribute: string, value: string): boolean {
  // Matching the stored blob is insufficient when Git transforms its bytes on checkout.
  return !(
    (attribute === "text" && !["set", "auto", "unset"].includes(value)) ||
    (attribute === "crlf" && !["set", "input", "unset"].includes(value)) ||
    (attribute === "eol" && value !== "lf") ||
    ["ident", "filter", "working-tree-encoding"].includes(attribute)
  );
}
