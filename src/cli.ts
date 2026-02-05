#!/usr/bin/env -S node --experimental-strip-types
/**
 * worktree-add.ts
 *
 * Create or reuse a Git worktree for <branch> as a sibling of the current worktree.
 * Note: the destination is placed next to whichever worktree you run this from,
 * not necessarily the original "main" checkout.
 */

import { Command } from "@commander-js/extra-typings";
import packageJson from "../package.json" with { type: "json" };
import { runWorktreeAdd } from "./cli/run-worktree-add.js";
import type { CliOptions } from "./cli/run-worktree-add.js";

function collectApp(app: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), app];
}

const program = new Command()
  .name(packageJson.name)
  .description(
    "Create or reuse a Git worktree for a branch as a sibling of the current worktree",
  )
  .version(packageJson.version)
  .argument("<branch>", "branch name for the worktree")
  .option(
    "-a, --app <name>",
    "Open the worktree in an app (repeatable)",
    collectApp,
  )
  .option(
    "--offline",
    "Allow creating a new local branch from HEAD when origin cannot be reached and the branch does not exist locally",
  )
  .option("-y, --yes", "Skip confirmation and replace existing destination")
  .option("--dry-run", "Show what would happen without making changes")
  .option("--interactive", "Allow confirmation prompts (requires a TTY)")
  .option("--verbose", "Show progress messages on stderr")
  .showHelpAfterError("(add --help for additional information)")
  .showSuggestionAfterError()
  .addHelpText(
    "after",
    `
Examples:
  $ worktree-add feature/login-form
  $ worktree-add feature/api --app code
  $ WORKTREE_ADD_APP=ghostty,code worktree-add feature/new-branch
  $ git branch --format="%(refname:short)" | head -n1 | xargs worktree-add

App notes:
  - App names are executed on your machine; only use values you trust.
  - Arguments are not parsed; pass only the app name (e.g., "code", not "code --wait").
  - WORKTREE_ADD_APP is a comma-separated list of apps (alternative to repeating --app).
  - To explicitly open nothing when WORKTREE_ADD_APP is set, pass --app "".

Dependencies:
  - git (with worktree support)
  - a package manager when package.json is present (npm, pnpm, yarn, bun, deno)
`,
  )
  .action(async (branch: string, options: CliOptions) => {
    try {
      await runWorktreeAdd(branch, options);
    } catch (error: unknown) {
      if (options.verbose) {
        console.error(error);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(message);
      }
      process.exitCode = 1;
    }
  });

if (!process.env.VITEST) {
  await program.parseAsync();
}
