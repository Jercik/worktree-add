import { describe, expect, it } from "vitest";

import { parseBranchConfig } from "./parse-branch-config.js";

describe("parseBranchConfig", () => {
  it("collects every value of each key of the branch, in order", () => {
    const output =
      "core.bare\nfalse\0branch.feature/x.remote\norigin\0branch.feature/x.merge\nrefs/heads/a\0branch.feature/x.merge\nrefs/heads/b\0";

    expect(parseBranchConfig(output, "feature/x")).toStrictEqual(
      new Map([
        ["branch.feature/x.remote", ["origin"]],
        ["branch.feature/x.merge", ["refs/heads/a", "refs/heads/b"]],
      ]),
    );
  });

  it("reads a key without a value as true", () => {
    expect(parseBranchConfig("branch.feature/x.rebase\0", "feature/x")).toStrictEqual(
      new Map([["branch.feature/x.rebase", ["true"]]]),
    );
  });

  it("keeps newlines inside a value", () => {
    expect(
      parseBranchConfig("branch.feature/x.description\nfirst\nsecond\0", "feature/x"),
    ).toStrictEqual(new Map([["branch.feature/x.description", ["first\nsecond"]]]));
  });

  it("skips the config of a branch whose name extends this one", () => {
    expect(
      parseBranchConfig("branch.feature/x.y.merge\nrefs/heads/main\0", "feature/x"),
    ).toStrictEqual(new Map());
  });
});
