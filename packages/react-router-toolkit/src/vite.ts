import { createServer, isRunnableDevEnvironment, loadConfigFromFile } from "vite";
import type { InlineConfig, Plugin, PluginOption, RunnableDevEnvironment } from "vite";

import { RouteEvaluationError } from "./errors";
import type { LoadRoutesOptions } from "./types";

/**
 * Evaluates the user's `routes.ts` / `react-router.config.ts` through Vite's
 * {@link https://vite.dev/guide/api-environment-runtimes.html ModuleRunner}.
 *
 * The user's own Vite config is loaded as-is (so path aliases match the production build), but
 * React Router's own plugin is stripped out: the toolkit only needs to _evaluate_ the route config,
 * not run React Router's full build pipeline — which reads every route module from disk during
 * config resolution and would fail when a `routes.ts` references files that do not exist yet
 * (exactly the case static analysis, e.g. a lint rule reporting missing route modules, must
 * support).
 */
export interface RouteModuleEvaluator extends AsyncDisposable {
  /** Evaluate a module file and return its namespace (including `default`). */
  evaluate(file: string): Promise<Record<string, unknown>>;
}

export async function createRouteModuleEvaluator(
  root: string,
  viteOptions: LoadRoutesOptions["vite"] = {},
): Promise<RouteModuleEvaluator> {
  const config = await buildInlineConfig(root, viteOptions);
  const server = await createServer(config);
  // Apply `define`-based shims to the optimized React Router dependencies.
  await server.environments["ssr"].depsOptimizer?.init();

  const ssrEnv = server.environments["ssr"];
  if (!isRunnableDevEnvironment(ssrEnv)) {
    await server.close();
    throw new RouteEvaluationError(
      "Vite's SSR environment is not runnable. " +
        "Ensure your Vite version is 7 or 8 with the default SSR environment enabled.",
      { file: root },
    );
  }

  return {
    evaluate: (file) => evaluateModule(ssrEnv, file),
    [Symbol.asyncDispose]: () => server.close(),
  };
}

async function evaluateModule(
  ssrEnv: RunnableDevEnvironment,
  file: string,
): Promise<Record<string, unknown>> {
  try {
    return await ssrEnv.runner.import(file);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new RouteEvaluationError(`Failed to evaluate "${file}": ${detail}`, { file, cause });
  }
}

async function buildInlineConfig(
  root: string,
  viteOptions: LoadRoutesOptions["vite"],
): Promise<InlineConfig> {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "development" },
    undefined,
    root,
  );

  const { plugins: rawPlugins, server: userServer, ...restConfig } = loaded?.config ?? {};
  const userPlugins = rawPlugins ? await flattenPluginOption(rawPlugins) : [];
  const filteredPlugins = userPlugins.filter((plugin) => !isReactRouterPlugin(plugin.name));

  return {
    ...restConfig,
    configFile: false,
    root,
    server: { ...userServer, hmr: false },
    plugins: [
      ...filteredPlugins,
      {
        name: "react-router-toolkit:user-define",
        config: () => ({ define: viteOptions?.define }),
      },
      {
        // React Router's `relative()` / `@react-router/fs-routes` read `getAppDirectory()` at
        // evaluation time, so these packages must run as shims inside the SSR module runner.
        name: "react-router-toolkit:react-router-shims",
        enforce: "post",
        configEnvironment: (name) => {
          if (name !== "ssr") {
            return;
          }
          return {
            optimizeDeps: {
              include: ["@react-router/dev/routes", "@react-router/fs-routes"],
              noDiscovery: true,
            },
            resolve: {
              noExternal: ["@react-router/dev", "@react-router/fs-routes"],
            },
          };
        },
      },
    ],
    logLevel: "silent",
  };
}

/** Match the plugins produced by `reactRouter()` from `@react-router/dev/vite`. */
function isReactRouterPlugin(name: string): boolean {
  return (
    name === "react-router" || name.startsWith("react-router:") || name.startsWith("react-router/")
  );
}

async function flattenPluginOption(option: PluginOption): Promise<Plugin[]> {
  const resolved = await option;
  if (!resolved) {
    return [];
  }
  if (Array.isArray(resolved)) {
    const nested = await Promise.all(resolved.map((item) => flattenPluginOption(item)));
    return nested.flat();
  }
  return [resolved];
}
