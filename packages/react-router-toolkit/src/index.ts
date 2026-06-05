export { loadReactRouterConfig } from "./loaders/config";
export { loadRoutes } from "./loaders/routes";
export { buildRouteManifest } from "./loaders/manifest";
export { resolveReactRouterConfig } from "./resolve";
export { analyzeRouteModules } from "./route-module-info";
export type {
  ClientLoaderExportInfo,
  ExportDeclarationKind,
  OutletContextTypeReference,
  OutletInfo,
  RouteExportInfo,
  RouteModuleExports,
  RouteModuleInfo,
  SourceSpan,
  UnknownExportInfo,
} from "./route-module-info";
export { flattenRouteTree } from "./route-tree";
export type { RouteLayoutInfo, RouteLayoutMap } from "./route-tree";

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
