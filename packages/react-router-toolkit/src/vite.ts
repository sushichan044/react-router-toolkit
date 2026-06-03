import { createServer, isRunnableDevEnvironment, loadConfigFromFile } from "vite";
import type {
  EnvironmentOptions,
  InlineConfig,
  Plugin,
  PluginOption,
  RunnableDevEnvironment,
} from "vite";

import { RouteEvaluationError } from "./errors";

export interface Evaluator extends AsyncDisposable {
  readonly environment: RunnableDevEnvironment;
}

type EvaluatorOptions = {
  vite?: {
    define?: Record<string, string>;
    /** Additional config for the module runner. */
    configEnvironment?: EnvironmentOptions | null;
    /**
     * Override Vite's dependency-optimization cache directory. Defaults to Vite's own default
     * (`<root>/node_modules/.vite`).
     *
     * Mainly useful when running multiple evaluators concurrently against the same project (e.g.
     * parallel test files): they would otherwise race on the shared deps cache commit. Pass a
     * unique directory per evaluator to isolate them.
     */
    cacheDir?: string;
  };

  /**
   * Disable Vite plugins from `@react-router/dev/vite`.
   *
   * This is useful when we need to evaluate invalid `app/routes.ts` without causing errors.
   *
   * @default false
   */
  disableReactRouterPlugins?: boolean;
};

export async function createEvaluator(
  root: string,
  options?: EvaluatorOptions,
): Promise<Evaluator> {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "development" },
    undefined,
    root,
  );

  const { plugins: rawPlugins, server: userServer, ...restConfig } = loaded?.config ?? {};
  const userPlugins = rawPlugins ? await flattenPluginOption(rawPlugins) : [];
  const filteredPlugins = options?.disableReactRouterPlugins
    ? userPlugins.filter((plugin) => !isReactRouterPlugin(plugin.name))
    : userPlugins;

  const inlineConfig = {
    ...restConfig,
    configFile: false,
    root,
    cacheDir: options?.vite?.cacheDir,
    server: { ...userServer, hmr: false, middlewareMode: true, watch: null },
    logLevel: "silent",
    define: options?.vite?.define,
    plugins: [
      ...filteredPlugins,
      ...(options?.vite?.configEnvironment != null
        ? [
            {
              name: "react-router-toolkit:ssr-environment",
              enforce: "post",
              configEnvironment: (name) =>
                name === "ssr" ? options.vite?.configEnvironment : undefined,
            } satisfies Plugin,
          ]
        : []),
    ],
  } satisfies InlineConfig;

  const server = await createServer(inlineConfig);
  await server.environments["ssr"].depsOptimizer?.init();

  if (!isRunnableDevEnvironment(server.environments["ssr"])) {
    await server.close();
    throw new RouteEvaluationError(
      "Vite's SSR environment is not runnable. " +
        "Ensure your Vite version is 7 or 8 with the default SSR environment enabled.",
      { file: root },
    );
  }

  const environment = server.environments["ssr"];
  return {
    environment,
    [Symbol.asyncDispose]: () => server.close(),
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
