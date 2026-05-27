import { existsSync } from "node:fs";
import { relative as relativePath, resolve as resolvePath } from "node:path";

import type { RouteConfigEntry } from "@react-router/dev/routes";

import { RouteEvaluationError, RouteManifestError, RouteValidationError } from "./errors";
import {
  configRoutesToRouteManifest,
  mergeReactRouterConfig,
  type Preset,
  type ReactRouterConfig,
  setAppDirectory,
} from "./react-router-internals";
import type { LoadRoutesOptions, ResolvedRouteManifest } from "./types";
import { createRouteModuleEvaluator } from "./vite";

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"] as const;

const REACT_ROUTER_CONFIG_BASENAME = "react-router.config";
const ROUTES_BASENAME = "routes";
const ROOT_BASENAME = "root";

/**
 * Resolve a React Router project's routing config the way React Router itself does, then return its
 * fully-resolved {@link ResolvedRouteManifest.routes route manifest} (plus the resolved
 * `appDirectory`).
 *
 * The user's `routes.ts` and optional `react-router.config.*` are evaluated through the user's own
 * Vite config (so aliases resolve), and the resulting route config is shaped into a manifest using
 * React Router's own algorithm (see `react-router-internals`). Because evaluation only runs
 * `routes.ts` and its imports — never the referenced route modules — a `routes.ts` may reference
 * route files that do not exist yet, which is what static analysis tools need.
 *
 * @throws {RouteEvaluationError} When `routes.ts` is missing or cannot be evaluated.
 * @throws {RouteValidationError} When the `routes.ts` default export is not a route config array.
 * @throws {RouteManifestError} When the `root` route module is absent or two routes share an id.
 */
export async function resolveRouteManifest(
  options: LoadRoutesOptions = {},
): Promise<ResolvedRouteManifest> {
  const { root = process.cwd() } = options;

  await using evaluator = await createRouteModuleEvaluator(root, options.vite);

  const userConfig = await loadReactRouterUserConfig(root, (file) => evaluator.evaluate(file));
  const appDirectory = resolvePath(root, userConfig.appDirectory || "app");

  const routesFile = findEntry(appDirectory, ROUTES_BASENAME);
  if (routesFile === undefined) {
    throw new RouteEvaluationError(
      `Could not find a route config file ("${ROUTES_BASENAME}.ts") in "${appDirectory}".`,
      { file: appDirectory },
    );
  }

  const rootFile = findEntry(appDirectory, ROOT_BASENAME);
  if (rootFile === undefined) {
    throw new RouteManifestError(
      `Could not find a root route module ("${ROOT_BASENAME}.{tsx,jsx,ts,js,...}") in "${appDirectory}". ` +
        "React Router framework mode requires app/root.tsx.",
    );
  }

  // React Router publishes the app directory before evaluating routes.ts so that `relative()` and
  // `@react-router/fs-routes` resolve against it.
  setAppDirectory(appDirectory);
  const userRoutes = await evaluateRouteConfig(routesFile, (file) => evaluator.evaluate(file));

  // Nest the user's route config under the resolved root route, mirroring React Router.
  const nestedRouteConfig: RouteConfigEntry[] = [
    {
      id: "root",
      path: "",
      file: relativePath(appDirectory, rootFile),
      children: userRoutes,
    },
  ];

  try {
    const routes = configRoutesToRouteManifest(appDirectory, nestedRouteConfig);
    return { appDirectory, routes };
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new RouteManifestError(`Invalid route config: ${detail}`, { cause });
  }
}

async function loadReactRouterUserConfig(
  root: string,
  evaluate: (file: string) => Promise<Record<string, unknown>>,
): Promise<ReactRouterConfig> {
  const configFile = findEntry(root, REACT_ROUTER_CONFIG_BASENAME);
  if (configFile === undefined) {
    return {};
  }

  const mod = await evaluate(configFile);
  const userConfig = mod["default"];
  if (typeof userConfig !== "object" || userConfig === null) {
    throw new RouteValidationError(`"${configFile}" must provide a default export config object.`);
  }

  const presetConfigs = await resolvePresetConfigs(userConfig as ReactRouterConfig);
  return mergeReactRouterConfig(...presetConfigs, userConfig as ReactRouterConfig);
}

async function resolvePresetConfigs(userConfig: ReactRouterConfig): Promise<ReactRouterConfig[]> {
  const presets: readonly Preset[] = userConfig.presets ?? [];
  const resolved = await Promise.all(
    presets.map(async (preset) => {
      if (!preset.reactRouterConfig) {
        return null;
      }
      const { presets: _ignored, ...config } = await preset.reactRouterConfig({
        reactRouterUserConfig: userConfig,
      });
      return config as ReactRouterConfig;
    }),
  );
  return resolved.filter((config): config is ReactRouterConfig => config !== null);
}

async function evaluateRouteConfig(
  routesFile: string,
  evaluate: (file: string) => Promise<Record<string, unknown>>,
): Promise<RouteConfigEntry[]> {
  const mod = await evaluate(routesFile);
  if (!("default" in mod)) {
    throw new RouteValidationError(`"${routesFile}" must provide a default export.`);
  }

  // The default export may be a route config array or a promise resolving to one.
  const resolved = await Promise.resolve(mod["default"]);
  if (!isRouteConfigEntryArray(resolved)) {
    throw new RouteValidationError(
      `The default export of "${routesFile}" must be an array of route config entries.`,
    );
  }
  return resolved;
}

function isRouteConfigEntryArray(value: unknown): value is RouteConfigEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { file?: unknown }).file === "string",
    )
  );
}

/** Locate `<basename>.<ext>` for the first supported module extension, returning an absolute path. */
function findEntry(directory: string, basename: string): string | undefined {
  for (const ext of MODULE_EXTENSIONS) {
    const candidate = resolvePath(directory, `${basename}${ext}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
