import { resolve as resolvePath } from "node:path";

import { createServer, isRunnableDevEnvironment, ViteDevServer } from "vite";

import type { CreateRouteManifestOptions, RouteConfigEntry } from "./types";
import { RouteEvaluationError, RouteValidationError } from "./types";
import { getDefaultExport } from "./utils";

function isRouteConfigEntry(value: unknown): value is RouteConfigEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const file = (value as Record<string, unknown>)["file"];
  return typeof file === "string";
}

function isRouteConfigEntryArray(value: unknown): value is RouteConfigEntry[] {
  return Array.isArray(value) && value.every(isRouteConfigEntry);
}

/**
 * Evaluate the user project's `app/routes.ts` using Vite's
 * {@link https://vite.dev/guide/api-environment-runtimes.html ModuleRunner}.
 *
 * - The user's `vite.config.ts` is loaded with Vite's default search rooted at `root`, so the React
 *   Router Vite plugin and any path aliases match what the production build sees.
 * - `globalThis.__reactRouterAppDirectory` is published by the React Router Vite plugin
 *   (`@react-router/dev/vite`), which the user project must register.
 * - The dev server is disposed automatically through `await using`.
 *
 * @throws {RouteEvaluationError} When Vite cannot load or execute the file.
 * @throws {RouteValidationError} When the default export is not an array of
 *   `RouteConfigEntry`-shaped objects.
 */
export async function evaluateRoutesFile(
  options: CreateRouteManifestOptions = {},
): Promise<RouteConfigEntry[]> {
  const root = options.root ?? process.cwd();
  const appDir = resolvePath(root, "app");
  const routesFile = resolvePath(appDir, "routes.ts");

  await using server = await createDisposableServer({
    root,
    server: {
      hmr: false,
    },
    environments: {
      ssr: {},
    },
    optimizeDeps: {
      noDiscovery: true,
    },
    logLevel: "silent",
    ...(import.meta.vitest && !import.meta.e2e
      ? {
          // inject shims for test fixtures
          define: {
            // https://github.com/remix-run/react-router/blob/abcabd593fb8abe5c30bd42d95489fd9df2ef243/packages/react-router-dev/config/routes.ts#L7-L13
            "globalThis.__reactRouterAppDirectory": JSON.stringify(appDir),
          },
        }
      : {}),
  });

  const ssrEnv = server.environments["ssr"];
  if (!isRunnableDevEnvironment(ssrEnv)) {
    throw new RouteEvaluationError(
      "Vite's SSR environment is not runnable. " +
        "Ensure your Vite version is 7 or 8 with the default SSR environment enabled.",
      { file: routesFile },
    );
  }

  let mod: Record<string, unknown>;
  try {
    mod = (await ssrEnv.runner.import(routesFile)) as Record<string, unknown>;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new RouteEvaluationError(`Failed to evaluate "${routesFile}": ${detail}`, {
      file: routesFile,
      cause,
    });
  }

  const defaultExport = getDefaultExport(mod);
  if (!defaultExport.success) {
    throw new RouteValidationError(`"${routesFile}" does not have a default export.`);
  }

  // normalize sync or async default export
  const resolved = await Promise.resolve(defaultExport.value);
  if (!isRouteConfigEntryArray(resolved)) {
    throw new RouteValidationError(
      `The default export of "${routesFile}" is not a RouteConfigEntry[].`,
    );
  }

  return resolved;
}

async function createDisposableServer(
  ...args: Parameters<typeof createServer>
): Promise<AsyncDisposable & ViteDevServer> {
  const server = await createServer(...args);

  return Object.assign(server, {
    [Symbol.asyncDispose]: async () => {
      await server.close();
    },
  });
}
