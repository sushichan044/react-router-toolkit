import { RouteEvaluationError, RouteValidationError } from "../errors";
import { validateRouteConfig } from "../vendor/react-router/config/routes";
import type { RouteConfigEntry } from "../vendor/react-router/config/routes";
import { createEvaluator } from "../vite";
import { findEntry } from "./utils"; // this logic should be vendored from react-router

const ROUTES_BASENAME = "routes";

type RoutesConfig = {
  /** Absolute path of the routes config file. */
  configFile: string;

  config: RouteConfigEntry[];
};

export async function loadRoutes(appDirectory: string, root: string): Promise<RoutesConfig> {
  const routesFile = findEntry(appDirectory, ROUTES_BASENAME);
  if (routesFile === undefined) {
    throw new RouteEvaluationError(
      `Could not find a route config file ("${ROUTES_BASENAME}.ts") in "${appDirectory}".`,
      { file: appDirectory },
    );
  }

  await using vite = await createEvaluator(root, {
    disableReactRouterPlugins: true,
    vite: {
      define: { "globalThis.__reactRouterAppDirectory": JSON.stringify(appDirectory) },
      configEnvironment: {
        optimizeDeps: {
          include: ["@react-router/dev/routes", "@react-router/fs-routes"],
          noDiscovery: true,
        },
        resolve: {
          noExternal: ["@react-router/dev", "@react-router/fs-routes"],
        },
      },
    },
  });
  const mod = await vite.environment.runner.import<Record<string, unknown>>(routesFile);

  if (!("default" in mod)) {
    throw new RouteValidationError(`"${routesFile}" must provide a default export.`);
  }

  const resolved = await Promise.resolve(mod["default"]);
  const validation = validateRouteConfig({
    routeConfigFile: routesFile,
    routeConfig: resolved,
  });
  if (!validation.valid) {
    throw new RouteValidationError(validation.message);
  }
  return { configFile: routesFile, config: validation.routeConfig };
}
