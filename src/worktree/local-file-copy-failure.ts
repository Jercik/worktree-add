export function createLocalFileCopyFailure(
  fileName: string,
  error: unknown,
  copiedFileNames: readonly string[],
  notAttemptedFileNames: readonly string[],
): Error {
  const message = error instanceof Error ? error.message : String(error);
  const progress = [
    copiedFileNames.length > 0
      ? `Copied before failure: ${copiedFileNames.join(", ")}.`
      : undefined,
    notAttemptedFileNames.length > 0
      ? `Not attempted after this failure: ${notAttemptedFileNames.join(", ")}.`
      : undefined,
  ].filter((detail) => detail !== undefined);
  const failure = new Error([`Failed to copy ${fileName}: ${message}`, ...progress].join("\n"), {
    cause: error,
  });
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    Object.assign(failure, { code: error.code });
  }
  return failure;
}
