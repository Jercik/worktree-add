export type StatusLogger = {
  readonly step: (message: string) => void;
  readonly success: (message: string) => void;
  readonly detail: (message: string) => void;
  readonly warn: (message: string) => void;
};

type StatusLoggerOptions = {
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly decorate: boolean;
};

const emit = (message: string): void => {
  console.error(message);
};

export function createStatusLogger(options: StatusLoggerOptions): StatusLogger {
  const shouldLogSteps = options.verbose || options.dryRun;
  const shouldLogDetails = options.verbose || options.dryRun;
  const stepPrefix = options.decorate ? "➤ " : "";
  const successPrefix = options.decorate ? "✓ " : "";
  const warningPrefix = options.decorate ? "⚠ " : "Warning: ";
  const detailPrefix = options.decorate ? "  • " : "  - ";
  const dryRunPrefix = options.dryRun ? "DRY RUN: " : "";

  return {
    step(message: string) {
      if (!shouldLogSteps) return;
      emit(`${dryRunPrefix}${stepPrefix}${message}`);
    },
    success(message: string) {
      if (!options.verbose) return;
      emit(`${dryRunPrefix}${successPrefix}${message}`);
    },
    detail(message: string) {
      if (!shouldLogDetails) return;
      emit(`${dryRunPrefix}${detailPrefix}${message}`);
    },
    warn(message: string) {
      emit(`${warningPrefix}${message}`);
    },
  };
}
