import { describe, expect, it } from "vitest";

import { extractDiagnosticLine } from "./extract-diagnostic-line.js";

describe("extractDiagnosticLine", () => {
  it("prefers fatal lines when present", () => {
    const error = new Error("info\nfatal: bad revision\nmore");
    expect(extractDiagnosticLine(error)).toBe("fatal: bad revision");
  });

  it("prefers error lines when present", () => {
    const error = new Error("warning\nerror: network down");
    expect(extractDiagnosticLine(error)).toBe("error: network down");
  });

  it("falls back to the last non-empty line when no markers match", () => {
    const error = new Error("line one\nline two");
    expect(extractDiagnosticLine(error)).toBe("line two");
  });

  it("handles string errors", () => {
    expect(extractDiagnosticLine("fatal: unknown")).toBe("fatal: unknown");
  });

  it("returns an empty string for blank messages", () => {
    expect(extractDiagnosticLine(new Error(" "))).toBe("");
  });
});
