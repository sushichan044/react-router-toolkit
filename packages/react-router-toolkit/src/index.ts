export { loadReactRouterConfig } from "./loaders/config";
export { loadRoutes } from "./loaders/routes";
export { buildRouteManifest } from "./loaders/manifest";
export { resolveReactRouterConfig } from "./resolve";
export { analyzeRouteModules, RECOGNIZED_EXPORT_NAMES } from "./route-module-info";
export { resolvedReactRouterConfigSchema, routeModuleInfoSchema } from "./schemas";
export type {
  ClientLoaderExportInfo,
  ExportDeclarationKind,
  JsonSafeResolvedReactRouterConfig,
  OutletContextTypeReference,
  OutletInfo,
  RouteExportInfo,
  RouteModuleExports,
  RouteModuleInfo,
  SourceSpan,
  UnknownExportInfo,
} from "./schemas";
export { flattenRouteTree } from "./route-tree";
export type { RouteLayoutInfo, RouteLayoutMap } from "./route-tree";
export { findMissingRouteFiles, matchRoute } from "./route-match";
export type { RouteMatchResult } from "./route-match";
export { findOrphanRouteFiles } from "./orphan-routes";
export type { FindOrphanRouteFilesOptions } from "./orphan-routes";
export { listPublicAssets } from "./public-assets";
export {
  buildRouteTreeFromManifest,
  matchesRoutePattern,
  parsePathTemplate,
} from "./route-path-pattern";
export type { ParsedPathTemplate, PathTemplateToken } from "./route-path-pattern";
export { collectRouteParams } from "./route-params";
// The typegen pipeline itself (computeTypegenTargets / writeTypegenFiles / createProjectFiles) is
// internal to the `react-router-toolkit typegen` CLI; only the pieces lint rules need are public.
export {
  classifyModuleOutletContext,
  NEAREST_OUTLET_CONTEXT_TYPE,
  toolkitTypesSpecifier,
} from "./typegen";
export type { ModuleOutletContext } from "./typegen";

// Public types re-exported from the vendored React Router internals (see src/vendor/react-router).
// These are not yet part of @react-router/dev's public API; when they become public, switch the
// import source here from the vendor copy to @react-router/dev.
export type {
  Preset,
  ReactRouterConfig,
  ResolvedReactRouterConfig,
} from "./vendor/react-router/config/config";
export type {
  RouteConfigEntry,
  RouteManifest,
  RouteManifestEntry,
} from "./vendor/react-router/config/routes";

export {
  ReactRouterConfigError,
  RouteEvaluationError,
  RouteLayoutConflictError,
  RouteManifestError,
  RouteToolkitError,
  RouteValidationError,
} from "./errors";
