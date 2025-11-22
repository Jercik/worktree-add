/**
 * package-manager.ts
 *
 * Helpers for detecting and running package managers
 */

import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { detect } from "package-manager-detector/detect";
import {
  formatCommand,
  getBinaryRunCommand,
} from "./package-manager-commands.js";
import { getInstallCommand, getInstallMessage } from "./install-commands.js";

interface RunOptions {
  readonly stdio?: "inherit" | "pipe";
}

interface RunBinaryResult {
  readonly stdout: string;
  readonly stderr: string;
}

const runOrThrow = (
  command: string,
  arguments_: string[],
  cwd: string,
  options: RunOptions = {},
): SpawnSyncReturns<string> => {
  const result = spawnSync(command, arguments_, {
    cwd,
    stdio: options.stdio ?? "inherit",
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status === null) {
    const signal = result.signal ? ` (signal: ${result.signal})` : "";
    throw new Error(
      `Command "${formatCommand(command, arguments_)}" terminated unexpectedly${signal}.`,
    );
  }

  if (result.status !== 0) {
    throw new Error(
      `Command "${formatCommand(command, arguments_)}" exited with code ${String(result.status)}.`,
    );
  }

  return result;
};

/**
 * Detect the package manager for a given project directory.
 * Checks the packageManager field in package.json first, then falls back to lockfiles.
 *
 * @param cwd The project directory to detect the package manager for
 * @returns The detected package manager name, or undefined if none detected
 */
async function detectPackageManager(
  cwd: string,
): Promise<"npm" | "yarn" | "pnpm" | "bun" | "deno" | undefined> {
  const result = await detect({
    cwd,
    strategies: ["packageManager-field", "lockfile"],
  });
  return result?.name;
}

/**
 * Install dependencies for a project using the detected package manager.
 */
export async function installDependencies(cwd: string): Promise<void> {
  const pm = await detectPackageManager(cwd);
  const cmd = await getInstallCommand(pm, cwd);
  console.log(getInstallMessage(cmd));
  runOrThrow(cmd.command, cmd.args, cwd);
}

export async function runPackageManagerBinary(
  cwd: string,
  binary: string,
  arguments_: string[] = [],
  options: RunOptions = {},
): Promise<RunBinaryResult | undefined> {
  const pm = await detectPackageManager(cwd);
  const { command, args: commandArguments } = getBinaryRunCommand(
    pm,
    binary,
    arguments_,
  );
  console.log(`➤ Running ${formatCommand(command, commandArguments)} …`);
  const result = runOrThrow(command, commandArguments, cwd, options);

  if (options.stdio === "pipe") {
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  return undefined;
}
