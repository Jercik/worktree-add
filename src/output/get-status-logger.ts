import type { StatusLogger } from "./create-status-logger.js";

// Fallback logger only emits warnings so important signals aren't dropped.
const fallbackLogger: StatusLogger = {
  step() {},
  success() {},
  detail() {},
  warn(message: string) {
    console.error(message);
  },
};

export function getStatusLogger(
  logger: StatusLogger | undefined,
): StatusLogger {
  return logger ?? fallbackLogger;
}
