import { afterEach, describe, expect, it, vi } from "vitest";
import { createStatusLogger } from "./create-status-logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createStatusLogger", () => {
  it("reports successful explicit actions without verbose output", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStatusLogger({ decorate: false, dryRun: false, verbose: false });

    logger.info("Copied .env.local");

    expect(consoleError).toHaveBeenCalledWith("Copied .env.local");
  });

  it("keeps success progress behind verbose output", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createStatusLogger({ decorate: false, dryRun: false, verbose: false });

    logger.success("Directory moved to trash successfully");

    expect(consoleError).not.toHaveBeenCalled();
  });
});
