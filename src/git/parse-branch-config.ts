/** Values per `branch.<name>.<variable>` key, in file order. */
export type BranchConfig = ReadonlyMap<string, readonly string[]>;

export function parseBranchConfig(nullListOutput: string, branchName: string): BranchConfig {
  const prefix = `branch.${branchName}.`;
  const config = new Map<string, string[]>();
  for (const entry of nullListOutput.split("\0")) {
    const newline = entry.indexOf("\n");
    const key = newline === -1 ? entry : entry.slice(0, newline);
    // Variable names contain no dot, so a dotted remainder belongs to a longer branch name.
    if (!key.startsWith(prefix) || key.slice(prefix.length).includes(".")) {
      continue;
    }
    // A key written without `=` is an implicit boolean true.
    const value = newline === -1 ? "true" : entry.slice(newline + 1);
    config.set(key, [...(config.get(key) ?? []), value]);
  }
  return config;
}
