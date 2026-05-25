export type {
  CreateRouteManifestOptions,
  LayoutChainEntry,
  LeafRoute,
  RouteConfigEntry,
  RouteManifest,
  RouteManifestEntry,
  UrlMatch,
} from "./types";

export {
  RouteEvaluationError,
  RouteManifestError,
  RouteToolkitError,
  RouteValidationError,
} from "./types";

export { evaluateRoutesFile } from "./evaluator";

export { flattenToManifest } from "./flattener";
export type { FlattenToManifestOptions } from "./flattener";

export { findByFile, getLayoutChain, getRouteById, listRoutes, matchUrl } from "./utils";

import { resolve as resolvePath } from "node:path";

import { evaluateRoutesFile } from "./evaluator";
import { flattenToManifest } from "./flattener";
import type { CreateRouteManifestOptions, RouteManifest } from "./types";

/**
 * Load and evaluate the user project's `app/routes.ts` with Vite's ModuleRunner, then flatten the
 * resulting tree into a {@link RouteManifest}.
 *
 * This is the high-level convenience wrapper around {@link evaluateRoutesFile} +
 * {@link flattenToManifest}.
 */
export async function createRouteManifest(
  options?: CreateRouteManifestOptions,
): Promise<RouteManifest> {
  const root = options?.root ?? process.cwd();
  const entries = await evaluateRoutesFile(options);
  return flattenToManifest(entries, { appDirectory: resolvePath(root, "app") });
}
