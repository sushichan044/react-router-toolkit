import { ReactRouterConfigError } from "../errors";
import { findEntry } from "../vendor/react-router/config/config";
import type { ReactRouterConfig as Config } from "../vendor/react-router/config/config";
import { createEvaluator } from "../vite";

const REACT_ROUTER_CONFIG_BASENAME = "react-router.config";

type ReactRouterConfig = {
  /** Absolute path of the config file. */
  configFile: string;

  config: Config;
};

export async function loadReactRouterConfig(
  root: string,
  options?: { cacheDir?: string },
): Promise<ReactRouterConfig | null> {
  const configFile = findEntry(root, REACT_ROUTER_CONFIG_BASENAME, { absolute: true });
  if (configFile === undefined) {
    return null;
  }

  await using vite = await createEvaluator(root, {
    vite: { cacheDir: options?.cacheDir },
    disableReactRouterPlugins: true,
  });
  const mod = await vite.environment.runner.import<Record<string, unknown>>(configFile);
  const userConfig = await Promise.resolve(mod["default"]);

  if (typeof userConfig !== "object" || userConfig === null) {
    throw new ReactRouterConfigError(
      `"${configFile}" must provide a default export config object.`,
    );
  }

  return { configFile, config: userConfig as Config };
}
