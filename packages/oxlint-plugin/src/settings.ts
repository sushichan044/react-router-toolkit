import type { Settings } from "@oxlint/plugins";
import * as v from "valibot";

/**
 * Key under the linter `settings` object that holds the pre-resolved React Router config. Users
 * resolve their config once (e.g. with top-level `await` in `oxlint.config.ts`) and pass it here
 * via {@link reactRouterToolkitSettings}, so rules read the resolved config synchronously instead of
 * evaluating the project on every lint pass.
 */
export const SETTINGS_KEY = "react-router-toolkit";

const routeManifestEntrySchema = v.object({
  id: v.string(),
  file: v.string(),
  path: v.optional(v.string()),
  index: v.optional(v.boolean()),
  caseSensitive: v.optional(v.boolean()),
  parentId: v.optional(v.string()),
});

/**
 * JSON-compatible view of `ResolvedReactRouterConfig`. `appDirectory` and `routes` (what the rules
 * consume) are validated strictly; the rest of the resolved config is passed through unchanged via
 * the loose object so future rules can read it.
 */
export const settingsSchema = v.looseObject({
  appDirectory: v.string(),
  routes: v.record(v.string(), routeManifestEntrySchema),
});

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
