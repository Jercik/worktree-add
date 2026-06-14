export const supportedPackageManagers = ["npm", "yarn", "pnpm", "bun", "deno"] as const;

export type PackageManagerName = (typeof supportedPackageManagers)[number];
export type DetectedPackageManagerName = PackageManagerName | undefined;

export function unsupportedPackageManagerName(pm: never): never {
  throw new Error(`Unsupported package manager: ${String(pm)}`);
}
