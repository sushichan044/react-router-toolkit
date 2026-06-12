import { create, RealFSProvider } from "@platformatic/vfs";
import type { VirtualFileSystem } from "@platformatic/vfs";

import type { RouteManifest } from "./vendor/react-router/config/routes";

export interface FindOrphanRouteFilesOptions {
  /**
   * Glob patterns that identify route module candidates inside the app directory.
   *
   * Only patterns of the form `<prefix>/<basename>` are supported — matching is performed by
   * comparing the basename portion against each file's name. Default patterns match files named
   * `route.tsx`, `route.ts`, `route.jsx`, or `route.js` anywhere in the tree.
   */
  routeFilePatterns?: readonly string[];
  /**
   * Directory names excluded from the recursive walk. Default: `["_components", "__tests__",
   * "__mocks__", "+types", "+toolkit-types"]`
   */
  excludeDirs?: readonly string[];
}

const DEFAULT_ROUTE_FILE_PATTERNS: readonly string[] = [
  "**/route.tsx",
  "**/route.ts",
  "**/route.jsx",
  "**/route.js",
];

const DEFAULT_EXCLUDE_DIRS: readonly string[] = [
  "_components",
  "__tests__",
  "__mocks__",
  "+types",
  "+toolkit-types",
];

/**
 * Walk `appDirectory` under `files` and return route-module candidates (files whose basenames match
 * the configured patterns) that are not registered in `routes`, sorted for stable assertions.
 *
 * Pattern matching is basename-only: the last path segment of each pattern is extracted and
 * compared against each file's name. This keeps the implementation dependency-free while covering
 * the default file-based routing conventions.
 *
 * `files` is a filesystem rooted at `appDirectory`, defaulting to the real one — pass a
 * `MemoryProvider`-backed VFS to test against in-memory sources.
 *
 * Returns an empty array when `appDirectory` does not exist.
 */
export async function findOrphanRouteFiles(
  routes: RouteManifest,
  appDirectory: string,
  files: VirtualFileSystem = create(new RealFSProvider(appDirectory), { moduleHooks: false }),
  options?: FindOrphanRouteFilesOptions,
): Promise<string[]> {
  const patterns = options?.routeFilePatterns ?? DEFAULT_ROUTE_FILE_PATTERNS;
  const excludeDirs = new Set(options?.excludeDirs ?? DEFAULT_EXCLUDE_DIRS);

  // Extract basenames from patterns (e.g. the last segment after "/").
  const basenames = new Set(patterns.map((p) => p.split("/").at(-1) ?? p));

  // Build a set of registered files (appDirectory-relative, as stored in RouteManifestEntry.file).
  const registeredFiles = new Set(Object.values(routes).map((entry) => entry.file));

  // Check if the appDirectory root is accessible.
  try {
    await files.promises.stat("/");
  } catch {
    return [];
  }

  const candidates: string[] = [];
  await walk(files, "/", excludeDirs, basenames, candidates);

  return candidates.filter((candidate) => !registeredFiles.has(candidate)).sort();
}

/** Recursive VFS walk. `dir` is the VFS-internal slash-prefixed path rooted at appDirectory. */
async function walk(
  files: VirtualFileSystem,
  dir: string,
  excludeDirs: Set<string>,
  basenames: Set<string>,
  results: string[],
): Promise<void> {
  let entries: string[];
  try {
    entries = await files.promises.readdir(dir);
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (excludeDirs.has(entry)) {
        return;
      }
      const entryPath = dir === "/" ? `/${entry}` : `${dir}/${entry}`;
      let stat;
      try {
        stat = await files.promises.stat(entryPath);
      } catch {
        return;
      }
      if (stat.isDirectory()) {
        await walk(files, entryPath, excludeDirs, basenames, results);
      } else if (stat.isFile() && basenames.has(entry)) {
        // Strip leading "/" to produce an appDirectory-relative path.
        results.push(entryPath.slice(1));
      }
    }),
  );
}
