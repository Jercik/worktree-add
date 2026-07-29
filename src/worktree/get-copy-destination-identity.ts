import { ensureRegularDirectory, type DirectoryIdentity } from "./local-file-paths.js";
import { createLocalFileCopyFailure } from "./local-file-copy-failure.js";
import type { PreflightedLocalFile } from "./preflight-local-files.js";

export async function getCopyDestinationIdentity(
  destinationDirectory: string,
  localFiles: readonly PreflightedLocalFile[],
  dryRun: boolean,
): Promise<DirectoryIdentity | undefined> {
  const currentFile = localFiles.at(0);
  if (dryRun || currentFile === undefined) {
    return undefined;
  }
  try {
    return await ensureRegularDirectory(destinationDirectory, "Copy destination");
  } catch (error: unknown) {
    throw createLocalFileCopyFailure(
      currentFile.fileName,
      error,
      [],
      localFiles.slice(1).map((localFile) => localFile.fileName),
    );
  }
}
