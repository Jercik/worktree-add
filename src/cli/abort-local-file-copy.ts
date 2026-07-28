import type { StatusLogger } from "../output/create-status-logger.js";

export async function abortLocalFileCopy(
  abortController: AbortController | undefined,
  copying: Promise<void> | undefined,
  logger: StatusLogger,
): Promise<void> {
  abortController?.abort();
  try {
    await copying;
  } catch (error: unknown) {
    // The copy routine attempts staging cleanup before rejecting.
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Interrupted local file copy: ${message}`);
  }
}
