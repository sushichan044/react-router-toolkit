import type { VirtualFileSystem } from "@platformatic/vfs";
import { dirname } from "pathe";

import type { TypegenTarget } from "./compute";
import { TYPEGEN_ROOT_DIR } from "./compute";

export interface WriteTypegenFilesResult {
  /** Project-root-relative paths of the generated files, sorted for deterministic output. */
  written: string[];
}

/**
 * Materialize the computed targets into `files`, a filesystem rooted at the project root (pass a
 * `MemoryProvider`-backed VFS to inspect the output in tests, or a `RealFSProvider`-backed one —
 * see `createProjectFiles` — to write to disk). The typegen directory is deleted and rebuilt from
 * scratch — simpler than diffing, and it guarantees no stale file survives a route rename. All
 * files are written concurrently.
 */
export async function writeTypegenFiles(
  targets: readonly TypegenTarget[],
  files: VirtualFileSystem,
): Promise<WriteTypegenFilesResult> {
  await removeTree(files, `/${TYPEGEN_ROOT_DIR}`);
  const written = await Promise.all(
    targets.map(async (target) => {
      const path = `/${target.outputFile}`;
      await files.promises.mkdir(dirname(path), { recursive: true });
      await files.promises.writeFile(path, target.expectedContent);
      return target.outputFile;
    }),
  );
  return { written: written.sort() };
}

/** Recursively delete a directory; the VFS API has no `rm -rf` equivalent. */
async function removeTree(files: VirtualFileSystem, dir: string): Promise<void> {
  const entries = await files.promises.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (entries === null) {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await removeTree(files, path);
      } else {
        await files.promises.unlink(path);
      }
    }),
  );
  await files.promises.rmdir(dir);
}
