import { compose, esmOnly, node, nodeTest, vitest } from "@j4k/oxlint-config";

const config = {
  ...compose(node, esmOnly, vitest, nodeTest),
  ignorePatterns: [".claude/", ".clawpatch/", ".codex/"],
};

export default config;
