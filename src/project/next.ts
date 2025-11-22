/**
 * next.ts
 *
 * Utilities for working with Next.js projects
 */

import * as fs from "node:fs/promises";
import path from "node:path";
import { runPackageManagerBinary } from "./package-manager.js";

type DependencyMap = Readonly<Record<string, string>>;

interface PackageJson {
  readonly dependencies?: DependencyMap;
  readonly devDependencies?: DependencyMap;
}

const loadPackageJson = async (
  directory: string,
): Promise<PackageJson | undefined> => {
  const packageJsonPath = path.join(directory, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf8");
    return JSON.parse(content) as PackageJson;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

export const isNextProject = async (directory: string): Promise<boolean> => {
  const packageJson = await loadPackageJson(directory);
  if (!packageJson) {
    return false;
  }
  return Boolean(
    packageJson.dependencies?.next ?? packageJson.devDependencies?.next,
  );
};

export const isNextTypegenSupported = async (
  directory: string,
): Promise<boolean> => {
  try {
    const result = await runPackageManagerBinary(
      directory,
      "next",
      ["--help"],
      { stdio: "pipe" },
    );
    if (!result) {
      return false;
    }
    return result.stdout
      .split("\n")
      .some((line) => line.trimStart().startsWith("typegen "));
  } catch {
    return false;
  }
};
