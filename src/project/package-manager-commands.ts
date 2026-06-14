import { spawnSync } from "node:child_process";
import type { DetectedPackageManagerName } from "./package-manager-name.js";
import { unsupportedPackageManagerName } from "./package-manager-name.js";

export const formatCommand = (command: string, arguments_: string[]): string =>
  [command, ...arguments_].join(" ").trim();

const parseMajorVersion = (value: string): number | undefined => {
  const match = /^(?<major>\d+)/u.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const major = Number.parseInt(match.groups?.major ?? "", 10);
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
  pm: DetectedPackageManagerName,
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
  return unsupportedPackageManagerName(pm);
};
