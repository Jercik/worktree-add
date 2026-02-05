import type { StatusLogger } from "../output/create-status-logger.js";

type SigintHandlerOptions = {
  readonly destinationDirectory: string;
  readonly logger: StatusLogger;
  readonly onCleanup: () => void;
};

export function registerSigintHandler(
  options: SigintHandlerOptions,
): () => void {
  const handler = (): void => {
    options.logger.warn("Received SIGINT. Aborting.");
    options.onCleanup();
    console.error(
      `Worktree setup may be incomplete at ${JSON.stringify(options.destinationDirectory)}.`,
    );
    // eslint-disable-next-line unicorn/no-process-exit -- CLI exits on SIGINT
    process.exit(130);
  };

  process.once("SIGINT", handler);
  return () => {
    process.off("SIGINT", handler);
  };
}
