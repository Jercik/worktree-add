import open from "open";
import type { StatusLogger } from "../output/create-status-logger.js";
import { fallbackStatusLogger } from "../output/create-status-logger.js";
import { getUnsafeAppNameReason } from "../app/get-unsafe-app-name-reason.js";
import type { OpenTarget } from "../app/resolve-open-target.js";

export async function openWorktreeApps(
  destinationDirectory: string,
  target: OpenTarget,
  options: { dryRun?: boolean; logger?: StatusLogger } = {},
): Promise<void> {
  const logger = options.logger ?? fallbackStatusLogger;
  const dryRun = options.dryRun ?? false;

  if (target.type === "none") {
    return;
  }

  if (target.type === "default") {
    if (dryRun) {
      logger.step(`Would open ${JSON.stringify(destinationDirectory)}`);
      return;
    }

    logger.step(`Opening ${JSON.stringify(destinationDirectory)} …`);
    try {
      await open(destinationDirectory, { wait: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to open ${JSON.stringify(destinationDirectory)}: ${message}.`);
    }
    return;
  }

  await Promise.all(
    target.apps.map(async (app) => {
      const unsafeReason = getUnsafeAppNameReason(app);
      if (unsafeReason) {
        logger.warn(`Skipping app ${JSON.stringify(app)}: ${unsafeReason}.`);
        return;
      }

      if (dryRun) {
        logger.step(`Would open ${JSON.stringify(destinationDirectory)} in ${JSON.stringify(app)}`);
        return;
      }

      logger.step(`Opening ${JSON.stringify(app)} …`);
      try {
        await open(destinationDirectory, {
          app: { name: [app] },
          wait: false,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const looksLikeArguments = /\s--?\S/u.test(app);
        const argumentHint = looksLikeArguments
          ? ' Note: application arguments are not supported; pass only the application name (for example, "code" instead of "code --wait").'
          : "";
        logger.warn(`Failed to open ${JSON.stringify(app)}: ${message}.${argumentHint}`);
      }
    }),
  );
}
