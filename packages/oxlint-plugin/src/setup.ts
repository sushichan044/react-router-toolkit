import { resolve as resolvePath } from "node:path";

import { analyzeRouteModules, resolveReactRouterConfig } from "react-router-toolkit";
import * as v from "valibot";

import type { ReactRouterToolkitSettings } from "./settings";
import { SETTINGS_KEY, settingsSchema } from "./settings";

interface ReactRouterToolkitSettingsOptions {
  /** Vite root: the directory containing `vite.config.*` and the app directory. */
  root: string;
  /**
   * Override Vite's dependency-optimization cache directory for the underlying evaluator. Pass a
   * unique directory to safely resolve multiple projects concurrently.
   */
  cacheDir?: string;
}

/**
 * Resolve a React Router project's config and return it shaped as linter `settings`, ready to
 * spread into `oxlint.config.ts`:
 *
 * ```ts
 * import { defineConfig } from "oxlint";
 * import { reactRouterToolkitSettings } from "@react-router-toolkit/oxlint-plugin/setup";
 *
 * export default defineConfig({
 *   jsPlugins: ["@react-router-toolkit/oxlint-plugin"],
 *   settings: {
 *     ...(await reactRouterToolkitSettings({ root: import.meta.dirname })),
 *   },
 * });
 * ```
 */
export async function reactRouterToolkitSettings(
  options: ReactRouterToolkitSettingsOptions,
): Promise<Record<typeof SETTINGS_KEY, ReactRouterToolkitSettings>> {
  const resolved = await resolveReactRouterConfig(options.root, { cacheDir: options.cacheDir });
  const jsonSafe: unknown = JSON.parse(JSON.stringify(resolved));
  return {
    [SETTINGS_KEY]: v.parse(settingsSchema, {
      // Absolute so the rules can render route paths relative to it regardless of how `root` was
      // passed.
      root: resolvePath(options.root),
      resolvedSettings: jsonSafe,
      // Source-derived outlet context facts, parsed once here so lint rules never read other files.
      routeModules: await analyzeRouteModules(resolved),
    }),
  };
}

export { SETTINGS_KEY } from "./settings";
export type { ReactRouterToolkitSettings } from "./settings";
