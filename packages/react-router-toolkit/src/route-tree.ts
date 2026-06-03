import { RouteLayoutConflictError } from "./errors";
import type { RouteConfigEntry } from "./vendor/react-router/config/routes";

export type RouteLayoutInfo = {
  /** File of the route rendered as the page at this URL (relative to the app directory). */
  file: string;
  /** Layout files wrapping this URL, ordered outermost → innermost (relative to the app directory). */
  layouts: string[];
};

/** URL pattern → the page file and its ordered layout chain. */
export type RouteLayoutMap = Record<string, RouteLayoutInfo>;

/**
 * Walk a route config tree (as returned by `loadRoutes`) and collapse it into a flat URL → layout
 * mapping: for every reachable URL, which file renders the page and which layout files wrap it, in
 * outermost-to-innermost order.
 *
 * Pathless layout routes contribute to the layout chain without producing their own URL. An index
 * route shares its parent's URL and is treated as the page rendered there, folding the parent route
 * into the layout chain. Two distinct path routes resolving to the same URL throw a
 * {@link RouteLayoutConflictError}.
 *
 * This makes it easy to snapshot-test routing structure or assert that two route definitions (e.g.
 * filesystem-based vs. hand-written) expose the same URLs with the same layout nesting.
 */
export function flattenRouteTree(routes: RouteConfigEntry[]): RouteLayoutMap {
  const map: RouteLayoutMap = {};

  const add = (url: string, info: RouteLayoutInfo, { allowOverride = false } = {}) => {
    const existing = map[url];
    if (existing && !allowOverride) {
      throw new RouteLayoutConflictError(
        `Duplicate route URL "${url}": both "${existing.file}" and "${info.file}" resolve to it.`,
        { url },
      );
    }
    map[url] = info;
  };

  const walk = (entries: RouteConfigEntry[], parentPath: string, parentLayouts: string[]) => {
    for (const route of entries) {
      const routePath =
        route.path !== undefined && route.path !== "" ? join(parentPath, route.path) : parentPath;
      const hasChildren = route.children !== undefined && route.children.length > 0;
      const childLayouts = hasChildren ? [...parentLayouts, route.file] : parentLayouts;

      if (route.index) {
        // Index routes render at the parent's URL. `parentLayouts` already includes the parent file
        // because the parent recursed with `childLayouts`, so this override reflects that.
        add(parentPath, { file: route.file, layouts: parentLayouts }, { allowOverride: true });
      } else if (route.path !== undefined) {
        add(routePath, { file: route.file, layouts: parentLayouts });
      }

      if (route.children) {
        walk(route.children, routePath, childLayouts);
      }
    }
  };

  walk(routes, "/", []);
  return map;
}

function join(parentPath: string, segment: string): string {
  return parentPath === "/" ? `/${segment}` : `${parentPath}/${segment}`;
}
