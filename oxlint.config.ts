import { defineConfig } from "oxlint";
import { esmOnly, node, nodeTest, vitest } from "@j4k/oxlint-config";

export default defineConfig({
  extends: [node, esmOnly, vitest, nodeTest],
  ignorePatterns: [".claude/", ".clawpatch/", ".codex/"],
});
