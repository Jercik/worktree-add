import { describe, expect, it } from "vitest";

import { supportedPackageManagerName } from "./package-manager-name.js";

describe("supportedPackageManagerName", () => {
  it("returns a package manager this tool can run", () => {
    expect(supportedPackageManagerName("pnpm")).toBe("pnpm");
  });

  it("returns undefined when no package manager was detected", () => {
    expect(supportedPackageManagerName(undefined)).toBeUndefined();
  });

  it("rejects a detected package manager this tool cannot run", () => {
    expect(() => supportedPackageManagerName("aube")).toThrow("Unsupported package manager: aube");
  });
});
