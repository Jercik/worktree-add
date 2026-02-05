import { describe, expect, it } from "vitest";

import { getUnsafeAppNameReason } from "./get-unsafe-app-name-reason.js";

describe("getUnsafeAppNameReason", () => {
  it("returns undefined for a normal name", () => {
    expect(getUnsafeAppNameReason("code")).toBeUndefined();
  });

  it("returns undefined for an absolute path", () => {
    expect(getUnsafeAppNameReason("/usr/bin/code")).toBeUndefined();
  });

  it("rejects newlines", () => {
    expect(getUnsafeAppNameReason("code\n--wait")).toBe(
      "contains control characters",
    );
  });

  it("rejects NUL bytes", () => {
    expect(getUnsafeAppNameReason("code\u0000")).toBe(
      "contains control characters",
    );
  });

  it("rejects C1 control characters", () => {
    expect(getUnsafeAppNameReason("code\u0085")).toBe(
      "contains control characters",
    );
  });

  it("allows punctuation characters in app names", () => {
    expect(getUnsafeAppNameReason("code;rm")).toBeUndefined();
    expect(getUnsafeAppNameReason("code|rm")).toBeUndefined();
    expect(getUnsafeAppNameReason("code`rm`")).toBeUndefined();
  });
});
