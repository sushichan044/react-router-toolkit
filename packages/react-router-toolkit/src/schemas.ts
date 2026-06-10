import * as v from "valibot";

/**
 * Valibot schemas for the toolkit's data shapes, usable by downstream tools (e.g. the oxlint
 * plugin) to validate values that crossed a JSON boundary. The schemas are the source of truth: the
 * public types are inferred from them, so a schema and its type can never drift apart.
 */

/** A character offset span (`[start, end)`) within the analyzed module's source text. */
export const sourceSpanSchema = v.object({
  start: v.number(),
  end: v.number(),
});

/** The `satisfies` / `as` type annotation attached to an `<Outlet context={...}>` value. */
export const outletContextTypeReferenceSchema = v.object({
  /** Source text of the type annotation (e.g. `"ShopContext"` or `"{ shopId: string }"`). */
  text: v.string(),
  /** Location of the type annotation within the module. */
  span: sourceSpanSchema,
  /**
   * Set when `text` is a bare identifier naming a `type` alias declared in this same module, which
   * is what lets a descendant route import the type from here. `null` otherwise (inline type,
   * generic, qualified name, or a name declared elsewhere).
   */
  localTypeAlias: v.nullable(
    v.object({
      exported: v.boolean(),
      span: sourceSpanSchema,
    }),
  ),
});

/**
 * One `<Outlet>` rendered by a route module. Every Outlet is recorded — including those that pass
 * no `context` — because React Router resets outlet context to `undefined` at each Outlet, so a
 * child's context is decided solely by its immediate parent's Outlet, never an ancestor's.
 */
export const outletInfoSchema = v.object({
  /** Location of the `<Outlet>` opening element. */
  span: sourceSpanSchema,
  /** Whether the Outlet has a `context={...}` prop at all. `false` means it passes `undefined`. */
  passesContext: v.boolean(),
  /** Whether the Outlet has spread attributes (`{...props}`), making its context indeterminate. */
  hasSpread: v.boolean(),
  /** The `satisfies` / `as` annotation on the context value, or `null` when not annotated. */
  annotation: v.nullable(
    v.object({
      operator: v.picklist(["satisfies", "as"]),
      type: outletContextTypeReferenceSchema,
    }),
  ),
});

/** How a route-module export is written in source. String union for JSON-serializability. */
export const exportDeclarationKindSchema = v.picklist([
  "function", // `export function loader() {}` / `export default function C() {}`
  "class", // `export class C {}` / `export default class {}`
  "arrow", // `export const action = async () => {}`
  "variable", // `export const handle = { ... }` (init is not a function/class)
  "expression", // `export default someValue` / `export default 42`
  "reexport", // `export { loader } from "./x"` / `export { x as loader }`
]);

/** Metadata for one recognized route-module export. A non-`null` slot means the export is present. */
export const routeExportInfoSchema = v.object({
  /** Location of the export declaration (or the specifier, for re-exports). */
  span: sourceSpanSchema,
  declarationKind: exportDeclarationKindSchema,
  /** Whether the value is an `async` function or arrow. `false` for non-functions and re-exports. */
  isAsync: v.boolean(),
  /** For `export { x } from "./mod"`, the `"./mod"` specifier. `null` otherwise. */
  reexportSource: v.nullable(v.string()),
});

/** `clientLoader`-specific metadata, additionally carrying its `hydrate` flag. */
export const clientLoaderExportInfoSchema = v.object({
  ...routeExportInfoSchema.entries,
  /** Whether a top-level `clientLoader.hydrate = true` assignment is present. */
  hydrate: v.boolean(),
});

/** An export whose name is not a recognized route-module API (useful for typo detection). */
export const unknownExportInfoSchema = v.object({
  ...routeExportInfoSchema.entries,
  /** The exported name (e.g. `"loaer"`). */
  name: v.string(),
});

/**
 * The recognized route-module exports. Each slot holds metadata when present and `null` when
 * absent, so consumers can check existence directly (e.g. `exports.loader !== null`).
 */
export const routeModuleExportsSchema = v.object({
  /** The route component. */
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

/** Route manifest entry enriched with on-disk location, the outlets it renders, and its exports. */
export const routeModuleInfoSchema = v.object({
  id: v.string(),
  parentId: v.optional(v.string()),
  /** Module path relative to the app directory, as in the route manifest. */
  file: v.string(),
  /** Absolute path to the module on disk. */
  physicalFile: v.string(),
  /** Every `<Outlet>` rendered by this module, in source order. */
  outlets: v.array(outletInfoSchema),
  /** The recognized route-module exports, keyed by name; `null` slots are absent. */
  exports: routeModuleExportsSchema,
  /** Top-level exports whose names are not recognized route-module APIs. */
  unknownExports: v.array(unknownExportInfoSchema),
});

/** Mirror of the vendored `RouteManifestEntry` (see src/vendor/react-router/config/routes.ts). */
export const routeManifestEntrySchema = v.object({
  id: v.string(),
  file: v.string(),
  path: v.optional(v.string()),
  index: v.optional(v.boolean()),
  caseSensitive: v.optional(v.boolean()),
  parentId: v.optional(v.string()),
});

/**
 * JSON-safe view of `ResolvedReactRouterConfig`. Undeclared properties — including the
 * function-typed ones (`buildEnd`, `serverBundles`, `prerender`) and `unstable_routeConfig` — are
 * stripped from the output by `v.object`, so the parsed value is JSON-safe by construction. To
 * expose another resolved-config property to consumers, declare it here.
 */
export const resolvedReactRouterConfigSchema = v.object({
  /** The absolute path to the application source directory. */
  appDirectory: v.string(),
  /** The React Router app basename. Defaults to `"/"`. */
  basename: v.string(),
  /** The absolute path to the build directory. */
  buildDirectory: v.string(),
  /** Enabled future flags. A record so new flags survive without a schema update. */
  future: v.record(v.string(), v.boolean()),
  /** Control the "Lazy Route Discovery" behavior. */
  routeDiscovery: v.optional(
    v.variant("mode", [
      v.object({ mode: v.literal("lazy"), manifestPath: v.optional(v.string()) }),
      v.object({ mode: v.literal("initial") }),
    ]),
  ),
  /** An object of all available routes, keyed by route id. */
  routes: v.record(v.string(), routeManifestEntrySchema),
  /** The file name of the server build output. */
  serverBuildFile: v.string(),
  /** The output format of the server build. */
  serverModuleFormat: v.picklist(["esm", "cjs"]),
  /** Whether server-side rendering is enabled. */
  ssr: v.boolean(),
  /** Whether to generate subresource integrity hashes for asset script tags. */
  subResourceIntegrity: v.boolean(),
  /** The allowed origins for actions / mutations. */
  allowedActionOrigins: v.union([v.array(v.string()), v.literal(false)]),
});

export type SourceSpan = v.InferOutput<typeof sourceSpanSchema>;
export type OutletContextTypeReference = v.InferOutput<typeof outletContextTypeReferenceSchema>;
export type OutletInfo = v.InferOutput<typeof outletInfoSchema>;
export type ExportDeclarationKind = v.InferOutput<typeof exportDeclarationKindSchema>;
export type RouteExportInfo = v.InferOutput<typeof routeExportInfoSchema>;
export type ClientLoaderExportInfo = v.InferOutput<typeof clientLoaderExportInfoSchema>;
export type UnknownExportInfo = v.InferOutput<typeof unknownExportInfoSchema>;
export type RouteModuleExports = v.InferOutput<typeof routeModuleExportsSchema>;
export type RouteModuleInfo = v.InferOutput<typeof routeModuleInfoSchema>;
export type JsonSafeResolvedReactRouterConfig = v.InferOutput<
  typeof resolvedReactRouterConfigSchema
>;
