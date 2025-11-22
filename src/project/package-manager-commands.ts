/**
 * package-manager-commands.ts
 *
 * Internal utilities for package manager operations
 */

import { spawnSync } from "node:child_process";

export const formatCommand = (
  command: string,
  arguments_: string[],
): string => {
  return [command, ...arguments_].join(" ").trim();
};

const parseMajorVersion = (value: string): number | undefined => {
  const match = value.trim().match(/^(\d+)/u);
  if (!match) {
    return undefined;
  }
  const major = Number.parseInt(match[1] ?? "");
  return Number.isNaN(major) ? undefined : major;
};

export const getYarnInstallArguments = (cwd: string): string[] => {
  const result = spawnSync("yarn", ["--version"], {
    cwd,
    encoding: "utf8",
  });

  if (!result.error && result.status === 0) {
    const versionOutput = result.stdout;
    const major = parseMajorVersion(versionOutput);
    if (major !== undefined && major >= 2) {
      return ["install", "--immutable"];
    }
  }

  return ["install", "--frozen-lockfile"];
};

export const getBinaryRunCommand = (
  pm: "npm" | "yarn" | "pnpm" | "bun" | "deno" | undefined,
  binary: string,
  arguments_: string[],
): { command: string; args: string[] } => {
  switch (pm) {
    case "pnpm": {
      return { command: "pnpm", args: ["exec", binary, ...arguments_] };
    }
    case "yarn": {
      return { command: "yarn", args: [binary, ...arguments_] };
    }
    case "bun": {
      return { command: "bun", args: ["x", binary, ...arguments_] };
    }
    case "npm":
    case "deno":
    case undefined: {
      return { command: "npx", args: [binary, ...arguments_] };
    }
  }
};
