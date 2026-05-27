import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function resolveWorkerPath(): string {
  const primary = fileURLToPath(new URL("./worker/eval-worker.mjs", import.meta.url));
  if (existsSync(primary)) return primary;
  return fileURLToPath(new URL("../dist/worker/eval-worker.mjs", import.meta.url));
}
const WORKER_PATH = resolveWorkerPath();

interface EvalCacheEntry {
  readonly mtimeMs: number;
  readonly files: readonly string[];
}

const evalCache = new Map<string, EvalCacheEntry>();

/**
 * Return the app-relative module paths declared by `<root>/app/routes.ts`, evaluating it through
 * `react-router-routing-toolkit` in a child process so the async evaluator can be consumed from a
 * synchronous lint rule. Results are cached per routes file and reused until its mtime changes.
 *
 * The worker writes its JSON result to a temp file rather than stdout: evaluating the project loads
 * its Vite config, whose plugins may print to stdout and corrupt a stdout-based payload.
 *
 * Returns `null` when evaluation cannot run (e.g. the routes file is missing, the project is not
 * resolvable, or the worker throws); the rule then reports nothing rather than a false positive.
 */
export function evaluateRouteModulePaths(
  root: string,
  routesFile: string,
): readonly string[] | null {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(routesFile).mtimeMs;
  } catch {
    return null;
  }

  const cached = evalCache.get(routesFile);
  if (cached?.mtimeMs === mtimeMs) {
    return cached.files;
  }

  const outDir = mkdtempSync(join(tmpdir(), "rrt-eval-"));
  const outFile = join(outDir, "routes.json");
  let output: string;
  try {
    execFileSync(process.execPath, [WORKER_PATH, root, outFile], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    });
    output = readFileSync(outFile, "utf8");
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr;
    console.error(
      `[valid-route-file] failed to evaluate routes (root: ${root}):\n` +
        (stderr ? String(stderr) : error instanceof Error ? error.message : String(error)),
    );
    return null;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }

  let files: readonly string[];
  try {
    const parsed: unknown = JSON.parse(output);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      return null;
    }
    files = parsed;
  } catch {
    return null;
  }

  evalCache.set(routesFile, { mtimeMs, files });
  return files;
}
