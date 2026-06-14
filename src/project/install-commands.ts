import path from "node:path";
import { fileExists } from "../git/git.js";
import { formatCommand, getYarnInstallArguments } from "./package-manager-commands.js";
import type { DetectedPackageManagerName } from "./package-manager-name.js";
import { unsupportedPackageManagerName } from "./package-manager-name.js";

interface InstallCommand {
  readonly command: string;
  readonly args: string[];
}

export async function getInstallCommand(
  pm: DetectedPackageManagerName,
  cwd: string,
): Promise<InstallCommand> {
  switch (pm) {
    case "pnpm": {
      return { command: "pnpm", args: ["install", "--frozen-lockfile"] };
    }

    case "yarn": {
      const yarnArguments = getYarnInstallArguments(cwd);
      return { command: "yarn", args: yarnArguments };
    }

    case "bun": {
      return { command: "bun", args: ["install", "--frozen-lockfile"] };
    }

    case "deno": {
      return { command: "deno", args: ["install", "--frozen"] };
    }

    case "npm":
    case undefined: {
      const hasLockfile = await fileExists(path.join(cwd, "package-lock.json"));
      if (hasLockfile) {
        return { command: "npm", args: ["ci"] };
      }
      return { command: "npm", args: ["install"] };
    }
  }
  return unsupportedPackageManagerName(pm);
}

export function getInstallMessage(cmd: InstallCommand): string {
  if (cmd.command === "npm" && cmd.args[0] === "ci") {
    return "Running npm ci (using package-lock.json) …";
  }
  return `Running ${formatCommand(cmd.command, cmd.args)} …`;
}
