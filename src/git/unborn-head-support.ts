import { git, resolveCommit } from "./git.js";

/** `git worktree add -b` starts from an unborn `HEAD` only from this git release (it infers `--orphan`). */
const UNBORN_HEAD_MIN_GIT = { major: 2, minor: 42 } as const;

/** The installed git's `major.minor`, or undefined when `git --version` has an unexpected shape. */
function readGitVersion(): { major: number; minor: number } | undefined {
  const match = /(?<major>\d+)\.(?<minor>\d+)/u.exec(git("--version"));
  if (match === null) {
    return undefined;
  }
  return { major: Number(match.groups?.major), minor: Number(match.groups?.minor) };
}

/** The installed git's version when it is too old to start a branch from an unborn `HEAD`, else undefined. */
export function findTooOldGitForUnbornHead(): string | undefined {
  if (resolveCommit("HEAD") !== undefined) {
    return undefined;
  }
  const version = readGitVersion();
  if (
    version === undefined ||
    version.major > UNBORN_HEAD_MIN_GIT.major ||
    (version.major === UNBORN_HEAD_MIN_GIT.major && version.minor >= UNBORN_HEAD_MIN_GIT.minor)
  ) {
    return undefined;
  }
  return `${version.major}.${version.minor}`;
}

export function formatUnbornHeadGitMessage(found: string): string {
  return `Creating a worktree in a repository with no commits needs git ${UNBORN_HEAD_MIN_GIT.major}.${UNBORN_HEAD_MIN_GIT.minor} or newer (found ${found}).`;
}
