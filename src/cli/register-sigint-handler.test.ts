import { describe, expect, it } from "vitest";
import { formatSigintAbortMessage } from "./register-sigint-handler.js";

describe("formatSigintAbortMessage", () => {
  it("names a destination whose move to trash may be incomplete", () => {
    expect(formatSigintAbortMessage("destination-may-be-incomplete", "/repo-feature")).toBe(
      'Worktree creation aborted. The destination may be incomplete at "/repo-feature".',
    );
  });
});
