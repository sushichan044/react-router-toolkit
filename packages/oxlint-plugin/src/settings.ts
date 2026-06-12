import type { Settings } from "@oxlint/plugins";
import { resolvedReactRouterConfigSchema, routeModuleInfoSchema } from "react-router-toolkit";
import * as v from "valibot";

/**
 * Key under the linter `settings` object that holds the pre-resolved React Router config. Users
 * resolve their config once (e.g. with top-level `await` in `oxlint.config.ts`) and pass it here
 * via {@link reactRouterToolkitSettings}, so rules read the resolved config synchronously instead of
 * evaluating the project on every lint pass.
 */
export const SETTINGS_KEY = "react-router-toolkit";

/**
 * Shape of this plugin's linter settings. The schemas for the values themselves (the JSON-safe
 * resolved config and the per-route module facts) live in `react-router-toolkit`; this module only
 * defines how they are arranged under the settings key.
 *
 * `routeModules` carries per-route facts derived from each module's source at setup time (see
 * `analyzeRouteModules` in `react-router-toolkit`): the module's physical path, the outlet context
 * it passes, and its recognized route-module exports. Rules read these without any cross-file
 * parsing at lint time (e.g. descendant routes read their parent's entry to type
 * `useOutletContext`).
 */
export const settingsSchema = v.object({
  /**
   * Absolute path to the project root (the directory containing `vite.config.*` and the app
   * directory).
   */
  root: v.string(),
  resolvedSettings: resolvedReactRouterConfigSchema,
  routeModules: v.record(v.string(), routeModuleInfoSchema),
  /**
   * Decoded URL paths of files in the project's public directory (e.g. `["/manual.pdf"]`). Each
   * entry is a `/`-prefixed, `decodeURI`-decoded path relative to the public directory root. Rules
   * use this to suppress false positives for static assets served directly by Vite.
   */
  publicAssets: v.array(v.string()),
});

export type { OutletInfo, RouteModuleInfo } from "react-router-toolkit";

export type ReactRouterToolkitSettings = v.InferOutput<typeof settingsSchema>;

/**
 * Read and validate this plugin's settings from the linter context. Returns `null` when the key is
 * absent (the plugin is enabled but unconfigured, so rules no-op); throws when the value is present
 * but malformed, surfacing the misconfiguration instead of silently skipping.
 */
export function readSettings(settings: Readonly<Settings>): ReactRouterToolkitSettings | null {
  const raw = settings[SETTINGS_KEY];
  if (raw === undefined) {
    return null;
  }
  return v.parse(settingsSchema, raw);
}
