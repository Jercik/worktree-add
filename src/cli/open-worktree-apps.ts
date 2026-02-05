import open from "open";
import type { StatusLogger } from "../output/create-status-logger.js";
import { getStatusLogger } from "../output/get-status-logger.js";
import { getUnsafeAppNameReason } from "../app/get-unsafe-app-name-reason.js";

export async function openWorktreeApps(
  destinationDirectory: string,
  apps: string[],
  options: { dryRun?: boolean; logger?: StatusLogger } = {},
): Promise<void> {
  const logger = getStatusLogger(options.logger);
  const dryRun = options.dryRun ?? false;

  await Promise.allSettled(
    apps.map(async (app) => {
      const unsafeReason = getUnsafeAppNameReason(app);
      if (unsafeReason) {
        logger.warn(`Skipping app ${JSON.stringify(app)}: ${unsafeReason}.`);
        return;
      }

      if (dryRun) {
        logger.step(`Would open ${JSON.stringify(app)}`);
        return;
      }

      logger.step(`Opening ${JSON.stringify(app)} …`);
      try {
        await open(destinationDirectory, { app: { name: app }, wait: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const hasWhitespace = /\s/u.test(app);
        const argumentHint = hasWhitespace
          ? ' Note: application arguments are not supported; pass only the application name (for example, "code" instead of "code --wait").'
          : "";
        logger.warn(
          `Failed to open ${JSON.stringify(app)}: ${message}.${argumentHint}`,
        );
      }
    }),
  );
}
