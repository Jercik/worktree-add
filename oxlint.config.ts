import { compose, esmOnly, node, vitest } from "@j4k/oxlint-config";

const config = {
  ...compose(node, esmOnly, vitest),
  ignorePatterns: [".claude/", ".clawpatch/", ".codex/"],
};

export default config;
