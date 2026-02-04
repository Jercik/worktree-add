import { describe, expect, it } from "vitest";

import { parseResolutionChoice } from "./parse-branch-head-mismatch-choice.js";

describe("parseResolutionChoice", () => {
  it("returns the default on empty input", () => {
    expect(parseResolutionChoice("", "keep-local")).toBe("keep-local");
    expect(parseResolutionChoice("   ", "update-local")).toBe("update-local");
  });

  it("parses keep-local", () => {
    expect(parseResolutionChoice("1", "update-local")).toBe("keep-local");
    expect(parseResolutionChoice("keep", "update-local")).toBe("keep-local");
    expect(parseResolutionChoice("local", "update-local")).toBe("keep-local");
  });

  it("parses update-local", () => {
    expect(parseResolutionChoice("2", "keep-local")).toBe("update-local");
    expect(parseResolutionChoice("update", "keep-local")).toBe("update-local");
    expect(parseResolutionChoice("remote", "keep-local")).toBe("update-local");
  });

  it("parses abort", () => {
    expect(parseResolutionChoice("3", "keep-local")).toBe("abort");
    expect(parseResolutionChoice("a", "keep-local")).toBe("abort");
    expect(parseResolutionChoice("q", "keep-local")).toBe("abort");
    expect(parseResolutionChoice("quit", "keep-local")).toBe("abort");
    expect(parseResolutionChoice("abort", "keep-local")).toBe("abort");
  });

  it("returns undefined on invalid input", () => {
    expect(parseResolutionChoice("nope", "keep-local")).toBeUndefined();
  });
});
