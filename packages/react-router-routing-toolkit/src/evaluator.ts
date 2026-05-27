import assert from "node:assert/strict";
import { resolve as resolvePath } from "node:path";

import { createServer, isRunnableDevEnvironment, ViteDevServer } from "vite";

import type { LoadRoutesOptions, RouteConfigEntry } from "./types";
import { RouteEvaluationError, RouteToolkitError, RouteValidationError } from "./types";

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
 * - To select an environment-dependent route config, pass a dedicated `import.meta` or
 *   `import.meta.env` property through `options.vite.define`; `process.env` is not injected.
 * - The dev server is disposed automatically through `await using`.
 *
 * @throws {RouteEvaluationError} When Vite cannot load or execute the file.
 * @throws {RouteValidationError} When the default export is not an array of
 *   `RouteConfigEntry`-shaped objects.
 */
export async function evaluateRoutesFile(
  options: LoadRoutesOptions = {},
): Promise<readonly RouteConfigEntry[]> {
  await using server = await createDisposableServer({
    root: options.vite?.root,
    server: {
      hmr: false,
    },
    environments: {
      ssr: {
        optimizeDeps: {
          include: ["@react-router/dev/routes", "@react-router/fs-routes"],
          noDiscovery: true,
        },
        resolve: {
          noExternal: ["@react-router/dev", "@react-router/fs-routes"],
        },
      },
    },
    plugins: [
      {
        name: "react-router-routing-toolkit:shim",
        config: (userConfig) => {
          if (import.meta.vitest && !import.meta.e2e) {
            return;
          }
          if (!userConfig.root) {
            throw new RouteToolkitError(
              "Specify `root` of vite config to continue evaluating with testing shim.",
              { kind: "evaluation" },
            );
          }

          const _appDir = resolvePath(userConfig.root, "app");
          return {
            define: {
              // inject shims for test fixtures
              "globalThis.__reactRouterAppDirectory": JSON.stringify(_appDir),
            },
          };
        },
      },
      {
        name: "react-router-routing-toolkit:user-config",
        config: () => {
          return {
            define: options.vite?.define,
          };
        },
      },
    ],
    logLevel: "silent",
  });

  const appDir = resolvePath(server.config.root, "app");
  const routesFile = resolvePath(appDir, "routes.ts");

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
    mod = await ssrEnv.runner.import(routesFile);
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
  // Inject `define`-based shims into react-router packages.
  await server.environments["ssr"].depsOptimizer?.init();

  return Object.assign(server, {
    [Symbol.asyncDispose]: async () => {
      await server.close();
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getDefaultExport(
  mod: Record<string, unknown>,
): { success: true; value: unknown } | { success: false } {
  if (!isRecord(mod) || !("default" in mod)) {
    return { success: false };
  }
  return { success: true, value: mod["default"] };
}
