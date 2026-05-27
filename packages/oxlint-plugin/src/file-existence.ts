import { readdirSync, statSync } from "node:fs";
import { basename, dirname } from "node:path";

interface DirCacheEntry {
  readonly mtimeMs: number;
  readonly entries: ReadonlySet<string>;
}

/**
 * Build a file-existence checker that caches each directory's listing keyed by the directory's
 * mtime. Adding or removing a sibling file changes the directory mtime, which invalidates the cache
 * so a freshly created route file stops being reported on the next lint pass.
 */
export function createFileExistenceChecker(): (absolutePath: string) => boolean {
  const dirCache = new Map<string, DirCacheEntry>();

  return function exists(absolutePath: string): boolean {
    const dir = dirname(absolutePath);
    const name = basename(absolutePath);

    let mtimeMs: number;
    try {
      mtimeMs = statSync(dir).mtimeMs;
    } catch {
      return false;
    }

    let cached = dirCache.get(dir);
    if (cached === undefined || cached.mtimeMs !== mtimeMs) {
      cached = { mtimeMs, entries: new Set(readdirSync(dir)) };
      dirCache.set(dir, cached);
    }

    return cached.entries.has(name);
  };
}
