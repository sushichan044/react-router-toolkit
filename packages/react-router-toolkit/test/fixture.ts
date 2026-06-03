import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll } from "vite-plus/test";

const FIXTURES_DIR = fileURLToPath(import.meta.resolve("./fixtures"));

/** Absolute path to a fixture project root. */
export function fixtureRoot(name: string): string {
  return resolve(FIXTURES_DIR, name);
}

/** Absolute path to a fixture's app directory (defaults to `app`). */
export function appDir(name: string, dir = "app"): string {
  return resolve(FIXTURES_DIR, name, dir);
}

/**
 * Create a dedicated dependency-optimization cache directory for the calling test file and remove
 * it once the file's tests finish. The fixtures share this package's `node_modules/.vite` cache, so
 * without isolation parallel test files would race on the deps cache commit (ENOTEMPTY). Call this
 * once per test file and pass the result to the toolkit APIs via their `cacheDir` option.
 */
export function isolatedCacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "react-router-toolkit-test-"));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
