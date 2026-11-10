const supportedPackageManagers = ["npm", "yarn", "pnpm", "bun", "deno"] as const;

type PackageManagerName = (typeof supportedPackageManagers)[number];
export type DetectedPackageManagerName = PackageManagerName | undefined;

export function supportedPackageManagerName(name: string | undefined): DetectedPackageManagerName {
  if (name === undefined) {
    return undefined;
  }
  const supported = supportedPackageManagers.find((candidate) => candidate === name);
  if (supported === undefined) {
    throw new Error(`Unsupported package manager: ${name}`);
  }
  return supported;
}

export function unsupportedPackageManagerName(pm: never): never {
  throw new Error(`Unsupported package manager: ${String(pm)}`);
}
