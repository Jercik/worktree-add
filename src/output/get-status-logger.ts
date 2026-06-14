import { fallbackStatusLogger } from "./create-status-logger.js";
import type { StatusLogger } from "./create-status-logger.js";

export function getStatusLogger(logger: StatusLogger | undefined): StatusLogger {
  return logger ?? fallbackStatusLogger;
}
