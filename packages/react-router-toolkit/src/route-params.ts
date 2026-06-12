import type { RouteManifest } from "./vendor/react-router/config/routes";

/**
 * Extract the parameter names from a single route path segment string.
 *
 * - `:name` → `"name"`
 * - `:name?` → `"name"` (optional param — strip the trailing `?`)
 * - `*` → `"*"` (splat)
 * - Static segments → ignored
 */
function extractParamsFromPath(path: string | undefined): ReadonlySet<string> {
  if (!path) {
    return new Set();
  }

  const params = new Set<string>();
  for (const segment of path.split("/")) {
    if (segment === "*") {
      params.add("*");
    } else if (segment.startsWith(":")) {
      // Strip leading `:` and optional trailing `?`
      const name = segment.slice(1).replace(/\?$/, "");
      if (name.length > 0) {
        params.add(name);
      }
    }
  }
  return params;
}

/**
 * Build a `Map<routeId, Set<paramName>>` where each entry holds the union of all path parameters
 * reachable from that route — i.e. the params on the route itself **plus** every ancestor route up
 * to the root.
 *
 * This function is intentionally pure: it performs no I/O and only reads the flat `RouteManifest`
 * that the oxlint plugin already holds in its resolved settings.
 */
export function collectRouteParams(routes: RouteManifest): Map<string, Set<string>> {
  // Pre-compute the params declared by each entry's own path segment (not inherited).
  const ownParams = new Map<string, ReadonlySet<string>>();
  for (const [id, entry] of Object.entries(routes)) {
    ownParams.set(id, extractParamsFromPath(entry.path));
  }

  // Walk the ancestor chain to accumulate params. Use a cache so each id is computed once.
  const cache = new Map<string, Set<string>>();

  function accumulated(id: string): Set<string> {
    const cached = cache.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const entry = routes[id];
    if (entry === undefined) {
      const empty = new Set<string>();
      cache.set(id, empty);
      return empty;
    }

    const own = ownParams.get(id) ?? new Set<string>();
    const result = new Set<string>(own);

    if (entry.parentId !== undefined) {
      for (const param of accumulated(entry.parentId)) {
        result.add(param);
      }
    }

    cache.set(id, result);
    return result;
  }

  const result = new Map<string, Set<string>>();
  for (const id of Object.keys(routes)) {
    result.set(id, accumulated(id));
  }
  return result;
}
