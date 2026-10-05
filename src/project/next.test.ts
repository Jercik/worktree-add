import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isNextProject } from "./next.js";

describe("isNextProject", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "worktree-add-next-"));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  const writeManifest = async (manifest: object) => {
    await fs.writeFile(path.join(directory, "package.json"), JSON.stringify(manifest));
  };

  it("does not treat a dependency-only workspace root as a Next app", async () => {
    await writeManifest({ dependencies: { next: "16.2.10" } });
    await fs.mkdir(path.join(directory, "apps", "console", "src", "app"), { recursive: true });
    await expect(isNextProject(directory)).resolves.toBe(false);
  });

  it.each([
    ["app", "dependencies"],
    ["pages", "dependencies"],
    ["src/app", "devDependencies"],
    ["src/pages", "devDependencies"],
  ])("detects %s with a declared Next %s", async (routeDirectory, dependencyKind) => {
    await writeManifest({ [dependencyKind]: { next: "16.2.10" } });
    await fs.mkdir(path.join(directory, routeDirectory), { recursive: true });
    await expect(isNextProject(directory)).resolves.toBe(true);
  });

  it("does not treat a route directory without Next as a Next app", async () => {
    await writeManifest({ dependencies: {} });
    await fs.mkdir(path.join(directory, "app"));
    await expect(isNextProject(directory)).resolves.toBe(false);
  });

  it("returns false without a manifest", async () => {
    await expect(isNextProject(directory)).resolves.toBe(false);
  });

  it("does not treat plain route-name files as route directories", async () => {
    await writeManifest({ dependencies: { next: "16.2.10" } });
    await fs.writeFile(path.join(directory, "app"), "not a directory");
    await fs.writeFile(path.join(directory, "pages"), "not a directory");
    await fs.writeFile(path.join(directory, "src"), "not a directory");
    await expect(isNextProject(directory)).resolves.toBe(false);
  });

  it("preserves malformed manifest errors", async () => {
    await fs.writeFile(path.join(directory, "package.json"), "{");
    await expect(isNextProject(directory)).rejects.toBeInstanceOf(SyntaxError);
  });
});
