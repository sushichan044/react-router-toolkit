import { buildRouteTree } from "./builder";
import { resolveRouteManifest } from "./evaluator";
import type { LoadRoutesOptions, RouteTree } from "./types";

/**
 * Resolve the user project's routes through its `reactRouter()` Vite plugin and assemble React
 * Router's route manifest into a {@link RouteTree} rooted at the synthesized `app/root.tsx`
 * layout.
 *
 * This is the high-level convenience wrapper around {@link resolveRouteManifest} +
 * {@link buildRouteTree}.
 */
export async function loadRouteTree(options?: LoadRoutesOptions): Promise<RouteTree> {
  const { routes } = await resolveRouteManifest(options);
  return buildRouteTree(routes);
}

export type {
  LoadRoutesOptions,
  ResolvedRouteManifest,
  RouteConfigEntry,
  RouteIndex,
  RouteManifest,
  RouteManifestEntry,
  RouteNode,
  RouteTree,
  UrlMatch,
} from "./types";

export {
  RouteEvaluationError,
  RouteManifestError,
  RouteToolkitError,
  RouteValidationError,
} from "./errors";

export { resolveRouteManifest } from "./evaluator";

export { buildRouteTree } from "./builder";

export { buildRouteIndex, listRoutes, matchUrl } from "./utils";
export type { ListRoutesOptions } from "./utils";
