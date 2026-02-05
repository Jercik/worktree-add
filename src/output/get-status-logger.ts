import type { StatusLogger } from "./create-status-logger.js";

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
