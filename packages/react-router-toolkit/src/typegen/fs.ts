import { create, RealFSProvider } from "@platformatic/vfs";
import type { VirtualFileSystem } from "@platformatic/vfs";

/**
 * An fs-compatible view of the real project directory, sandboxed under `root`, for passing to
 * `writeTypegenFiles`. Paths inside are project-root-relative (e.g.
 * `/.react-router-toolkit/types/...`), matching `TypegenTarget.outputFile` with a leading slash.
 * Module hooks are disabled: this VFS is never mounted, it only reads and writes real files.
 */
export function createProjectFiles(root: string): VirtualFileSystem {
  return create(new RealFSProvider(root), { moduleHooks: false });
}
