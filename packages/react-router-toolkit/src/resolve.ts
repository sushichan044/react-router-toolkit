import { ReactRouterConfigError, RouteManifestError } from "./errors";
import { loadReactRouterConfig } from "./loaders/config";
import { loadRoutes } from "./loaders/routes";
import { resolveConfig } from "./vendor/react-router/config/config";
import type { ResolvedReactRouterConfig } from "./vendor/react-router/config/config";

type ResolveReactRouterConfigOptions = {
  /** Skip loading and assembling routes; resolve config only. `routes` resolves to `{}`. */
  skipRoutes?: boolean;
  /**
   * Override Vite's dependency-optimization cache directory for the evaluators. Defaults to Vite's
   * own default. Pass a unique directory to safely run multiple resolutions against the same
   * project concurrently (e.g. parallel test files).
   */
  cacheDir?: string;
};

/**
 * Load `react-router.config.*` and `routes.*` through the toolkit's Vite Module Runner evaluator
 * and resolve them into a {@link ResolvedReactRouterConfig}, mirroring React Router's own
 * end-to-end config resolution (presets, defaults, normalization, route manifest assembly, and
 * future flag resolution).
 *
 * Config and routes are loaded in the correct order — the config (and its presets) is resolved
 * first so that the `appDirectory` routes are loaded from honors any preset that relocates it.
 *
 * Throws {@link ReactRouterConfigError} for invalid config and {@link RouteManifestError} when the
 * route tree cannot be assembled (missing `app/root.*` or a duplicate route id).
 */
export async function resolveReactRouterConfig(
  root: string,
  options?: ResolveReactRouterConfigOptions,
): Promise<ResolvedReactRouterConfig> {
  const loaded = await loadReactRouterConfig(root, { cacheDir: options?.cacheDir });

  const result = await resolveConfig({
    root,
    reactRouterUserConfig: loaded?.config ?? {},
    loadRouteConfig: async (appDirectory) =>
      (await loadRoutes(appDirectory, root, { cacheDir: options?.cacheDir })).config,
    skipRoutes: options?.skipRoutes,
  });

  if (!result.ok) {
    throw result.kind === "manifest"
      ? new RouteManifestError(result.message)
      : new ReactRouterConfigError(result.message);
  }

  return result.value;
}
