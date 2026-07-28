import type { StatusLogger } from "../output/create-status-logger.js";

export type SigintCleanupOutcome = "destination-may-be-incomplete" | "kept" | "none" | "removed";

interface SigintHandlerOptions {
  readonly destinationDirectory: string;
  readonly logger: StatusLogger;
  readonly onCleanup: () => SigintCleanupOutcome | Promise<SigintCleanupOutcome>;
}

export function formatSigintAbortMessage(
  cleanupOutcome: SigintCleanupOutcome | undefined,
  destinationDirectory: string,
): string {
  if (cleanupOutcome === "kept") {
    return `Worktree creation aborted. The completed worktree was kept at ${JSON.stringify(destinationDirectory)}.`;
  }
  if (cleanupOutcome === "removed") {
    return `Worktree creation aborted. If cleanup failed, the directory may be incomplete at ${JSON.stringify(destinationDirectory)}.`;
  }
  if (cleanupOutcome === "destination-may-be-incomplete") {
    return `Worktree creation aborted. The destination may be incomplete at ${JSON.stringify(destinationDirectory)}.`;
  }
  return "Worktree creation aborted.";
}

export function registerSigintHandler(options: SigintHandlerOptions): () => void {
  let handled = false;
  const finishAbort = async (): Promise<void> => {
    let cleanupOutcome: SigintCleanupOutcome | undefined;
    try {
      cleanupOutcome = await options.onCleanup();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      options.logger.warn(`Cleanup after SIGINT failed: ${message}`);
    }
    console.error(formatSigintAbortMessage(cleanupOutcome, options.destinationDirectory));
    // eslint-disable-next-line unicorn/no-process-exit -- CLI exits on SIGINT
    process.exit(130);
  };

  const handler = (): void => {
    if (handled) {
      // eslint-disable-next-line unicorn/no-process-exit -- CLI exits on SIGINT
      process.exit(130);
    }
    handled = true;
    options.logger.warn("Received SIGINT. Aborting.");
    void finishAbort();
  };

  process.on("SIGINT", handler);
  return () => {
    process.off("SIGINT", handler);
  };
}
