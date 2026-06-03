import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = fileURLToPath(import.meta.resolve("./fixtures"));

/** Absolute path to a fixture project root. */
export function fixtureRoot(name: string): string {
  return resolve(FIXTURES_DIR, name);
}

/** Absolute path to a fixture's app directory (defaults to `app`). */
export function appDir(name: string, dir = "app"): string {
  return resolve(FIXTURES_DIR, name, dir);
}
