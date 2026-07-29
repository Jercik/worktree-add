interface WorktreeAddFailureOptions {
  readonly cleanupIfNeeded: (reason: string) => boolean;
  readonly destinationDirectory: string;
  readonly setupCompleted: boolean;
  readonly sigintCleanupStarted: boolean;
  readonly worktreeCreated: boolean;
}

export function handleWorktreeAddFailure(error: unknown, options: WorktreeAddFailureOptions): void {
  if (options.sigintCleanupStarted) {
    return;
  }
  if (!options.setupCompleted) {
    options.cleanupIfNeeded("due to failure");
    throw error;
  }
  if (!options.worktreeCreated) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  const failure = new Error(
    `${message}\nThe worktree at ${JSON.stringify(options.destinationDirectory)} was kept.`,
    { cause: error },
  );
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    Object.assign(failure, { code: error.code });
  }
  throw failure;
}
