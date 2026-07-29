import { describe, expect, it } from "vitest";

import { isGeneratedPath } from "./is-generated-path.js";

describe("isGeneratedPath", () => {
  it("matches generated directories at any depth", () => {
    expect(isGeneratedPath("node_modules/package/index.js")).toBe(true);
    expect(isGeneratedPath("packages/app/node_modules/package/index.js")).toBe(true);
    expect(isGeneratedPath("dist/index.js")).toBe(true);
    expect(isGeneratedPath("packages/app/dist/index.js")).toBe(true);
  });

  it("matches TypeScript build metadata at any depth", () => {
    expect(isGeneratedPath("tsconfig.tsbuildinfo")).toBe(true);
    expect(isGeneratedPath("packages/app/tsconfig.tsbuildinfo")).toBe(true);
  });

  it("keeps useful local configuration", () => {
    expect(isGeneratedPath(".env")).toBe(false);
    expect(isGeneratedPath(".npmrc")).toBe(false);
    expect(isGeneratedPath("packages/app/.env.local")).toBe(false);
    expect(isGeneratedPath("docs/build-notes/example.md")).toBe(false);
  });
});
