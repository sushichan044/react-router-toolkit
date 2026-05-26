import { resolve as resolvePath } from "node:path";

import { buildRouteTree } from "./builder";
import { evaluateRoutesFile } from "./evaluator";
import type { LoadRoutesOptions, RouteTree } from "./types";

/**
 * Load and evaluate the user project's `app/routes.ts` with Vite's ModuleRunner, then assemble the
 * result into a {@link RouteTree} rooted at the synthesized `app/root.tsx` layout.
 *
 * This is the high-level convenience wrapper around {@link evaluateRoutesFile} +
 * {@link buildRouteTree}.
 */
export async function loadRouteTree(options?: LoadRoutesOptions): Promise<RouteTree> {
  const root = options?.root ?? process.cwd();
  const entries = await evaluateRoutesFile(options);
  return buildRouteTree(entries, { appDirectory: resolvePath(root, "app") });
}

export type {
  BranchRouteNode,
  IndexRouteNode,
  LayoutRouteNode,
  LeafRouteNode,
  LoadRoutesOptions,
  PathfulRouteNode,
  PathlessRouteNode,
  RouteConfigEntry,
  RouteIndex,
  RouteNode,
  RouteTree,
  TerminalRouteNode,
  UrlMatch,
  WrapperRouteNode,
} from "./types";

export {
  RouteEvaluationError,
  RouteManifestError,
  RouteToolkitError,
  RouteValidationError,
} from "./types";

export { evaluateRoutesFile } from "./evaluator";

export { buildRouteTree } from "./builder";
export type { BuildRouteTreeOptions } from "./builder";

export {
  buildRouteIndex,
  findByFile,
  getRenderChain,
  getRouteById,
  isPathful,
  isPathless,
  isTerminal,
  isWrapper,
  listRoutes,
  matchUrl,
} from "./utils";
