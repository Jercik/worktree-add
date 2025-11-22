/**
 * install-commands.ts
 *
 * Package manager-specific install command logic
 */

import path from "node:path";
import { fileExists } from "../git/git.js";
import {
  formatCommand,
  getYarnInstallArguments,
} from "./package-manager-commands.js";

type PackageManager = "npm" | "yarn" | "pnpm" | "bun" | "deno" | undefined;

interface InstallCommand {
  readonly command: string;
  readonly args: string[];
}

/**
 * Get the install command for the given package manager
 */
export async function getInstallCommand(
  pm: PackageManager,
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
      // Use npm ci if lockfile exists, otherwise npm install
      const hasLockfile = await fileExists(path.join(cwd, "package-lock.json"));
      if (hasLockfile) {
        return { command: "npm", args: ["ci"] };
      }
      return { command: "npm", args: ["install"] };
    }
  }
}

/**
 * Get the display message for an install command
 */
export function getInstallMessage(cmd: InstallCommand): string {
  if (cmd.command === "npm" && cmd.args[0] === "ci") {
    return "➤ Running npm ci (using package-lock.json) …";
  }
  return `➤ Running ${formatCommand(cmd.command, cmd.args)} …`;
}
