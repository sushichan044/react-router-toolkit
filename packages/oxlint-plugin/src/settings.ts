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

const sourceSpanSchema = v.object({
  start: v.number(),
  end: v.number(),
});

const outletContextTypeSchema = v.object({
  text: v.string(),
  span: sourceSpanSchema,
  localTypeAlias: v.nullable(
    v.object({
      exported: v.boolean(),
      span: sourceSpanSchema,
    }),
  ),
});

const outletInfoSchema = v.object({
  span: sourceSpanSchema,
  passesContext: v.boolean(),
  hasSpread: v.boolean(),
  annotation: v.nullable(
    v.object({
      operator: v.picklist(["satisfies", "as"]),
      type: outletContextTypeSchema,
    }),
  ),
});

const exportDeclarationKindSchema = v.picklist([
  "function",
  "class",
  "arrow",
  "variable",
  "expression",
  "reexport",
]);

const routeExportInfoSchema = v.object({
  span: sourceSpanSchema,
  declarationKind: exportDeclarationKindSchema,
  isAsync: v.boolean(),
  reexportSource: v.nullable(v.string()),
});

const clientLoaderExportInfoSchema = v.object({
  ...routeExportInfoSchema.entries,
  hydrate: v.boolean(),
});

const routeModuleExportsSchema = v.object({
  default: v.nullable(routeExportInfoSchema),
  ErrorBoundary: v.nullable(routeExportInfoSchema),
  HydrateFallback: v.nullable(routeExportInfoSchema),
  loader: v.nullable(routeExportInfoSchema),
  clientLoader: v.nullable(clientLoaderExportInfoSchema),
  action: v.nullable(routeExportInfoSchema),
  clientAction: v.nullable(routeExportInfoSchema),
  middleware: v.nullable(routeExportInfoSchema),
  clientMiddleware: v.nullable(routeExportInfoSchema),
  headers: v.nullable(routeExportInfoSchema),
  links: v.nullable(routeExportInfoSchema),
  meta: v.nullable(routeExportInfoSchema),
  handle: v.nullable(routeExportInfoSchema),
  shouldRevalidate: v.nullable(routeExportInfoSchema),
});

const unknownExportInfoSchema = v.object({
  ...routeExportInfoSchema.entries,
  name: v.string(),
});

/**
 * Per-route facts derived from each module's source at setup time (see `analyzeRouteModules` in
 * `react-router-toolkit`): the module's physical path, the outlet context it passes, and its
 * recognized route-module exports. Rules read these without any cross-file parsing at lint time
 * (e.g. descendant routes read their parent's entry to type `useOutletContext`).
 */
const routeModuleInfoSchema = v.object({
  id: v.string(),
  parentId: v.optional(v.string()),
  file: v.string(),
  physicalFile: v.string(),
  outlets: v.array(outletInfoSchema),
  exports: routeModuleExportsSchema,
  unknownExports: v.array(unknownExportInfoSchema),
});

/**
 * JSON-compatible view of `ResolvedReactRouterConfig`. `appDirectory` and `routes` (what the rules
 * consume) are validated strictly; the rest of the resolved config is passed through unchanged via
 * the loose object so future rules can read it. `routeModules` carries the source-derived outlet
 * context facts keyed by route id.
 */
export const settingsSchema = v.object({
  /**
   * Absolute path to the project root (the directory containing `vite.config.*` and the app
   * directory).
   */
  root: v.string(),
  resolvedSettings: v.looseObject({
    appDirectory: v.string(),
    routes: v.record(v.string(), routeManifestEntrySchema),
  }),
  routeModules: v.optional(v.record(v.string(), routeModuleInfoSchema)),
});

export type RouteModuleInfo = v.InferOutput<typeof routeModuleInfoSchema>;
export type OutletInfo = v.InferOutput<typeof outletInfoSchema>;

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
