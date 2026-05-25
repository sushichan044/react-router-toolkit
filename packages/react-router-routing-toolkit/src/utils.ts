import { posix as posixPath } from "node:path";

import type { RouteObject } from "react-router";
import { matchRoutes } from "react-router";

import type {
  LayoutChainEntry,
  LeafRoute,
  RouteManifest,
  RouteManifestEntry,
  UrlMatch,
} from "./types";
import { RouteManifestError } from "./types";

function extractParams(fullPath: string): readonly string[] {
  const params: string[] = [];
  for (const segment of fullPath.split("/")) {
    if (segment.startsWith(":")) {
      const name = segment.slice(1).replace(/\?$/, "");
      if (name.length > 0) {
        params.push(name);
      }
    } else if (segment === "*") {
      params.push("*");
    }
  }
  return params;
}

/**
 * Rebuild the tree of {@link RouteObject}s that `matchRoutes` expects from a flat
 * {@link RouteManifest}.
 *
 * Relies on the manifest's depth-first insertion order so that, when the map is iterated, each
 * entry's `parentId` has already been seen.
 */
function buildRouteTree(manifest: RouteManifest): RouteObject[] {
  const childrenByParent = new Map<string | undefined, RouteObject[]>();

  for (const entry of manifest.values()) {
    const routeObject: RouteObject = entry.index
      ? {
          id: entry.id,
          index: true,
          caseSensitive: entry.caseSensitive,
        }
      : {
          id: entry.id,
          path: entry.path,
          caseSensitive: entry.caseSensitive,
        };

    const bucket = childrenByParent.get(entry.parentId) ?? [];
    bucket.push(routeObject);
    childrenByParent.set(entry.parentId, bucket);
  }

  function attachChildren(obj: RouteObject): RouteObject {
    if (obj.index === true) {
      return obj;
    }
    const children = childrenByParent.get(obj.id);
    if (children !== undefined && children.length > 0) {
      return { ...obj, children: children.map(attachChildren) };
    }
    return obj;
  }

  const roots = childrenByParent.get(undefined) ?? [];
  return roots.map(attachChildren);
}

/**
 * Look up a manifest entry by id. Throws when the id is missing.
 *
 * @throws {RouteManifestError}
 */
export function getRouteById(manifest: RouteManifest, id: string): RouteManifestEntry {
  const entry = manifest.get(id);
  if (entry === undefined) {
    throw new RouteManifestError(`Route id "${id}" is not present in the manifest.`);
  }
  return entry;
}

/**
 * Walk parent pointers from a given route id back to the application root and return the chain in
 * root → leaf order (the requested entry is the last element).
 *
 * @throws {RouteManifestError} When `id` is not present in the manifest
 */
export function getLayoutChain(manifest: RouteManifest, id: string): readonly LayoutChainEntry[] {
  if (!manifest.has(id)) {
    throw new RouteManifestError(`Route id "${id}" is not present in the manifest.`);
  }
  const chain: LayoutChainEntry[] = [];
  let current: RouteManifestEntry | undefined = manifest.get(id);
  while (current !== undefined) {
    chain.unshift({
      id: current.id,
      file: current.file,
      isLayout: current.isLayout,
      isIndex: current.index,
    });
    current = current.parentId !== undefined ? manifest.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * Reverse-lookup a manifest entry by its `file` field. Paths are compared after POSIX
 * normalisation. Returns `undefined` when no entry matches.
 */
export function findByFile(
  manifest: RouteManifest,
  filePath: string,
): RouteManifestEntry | undefined {
  const target = posixPath.normalize(filePath);
  for (const entry of manifest.values()) {
    if (posixPath.normalize(entry.file) === target) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Enumerate every leaf route in the manifest as URL-pattern-sorted {@link LeafRoute}s. Layout
 * entries and other non-matchable nodes are excluded; index routes and child-less routes are
 * included.
 */
export function listRoutes(manifest: RouteManifest): readonly LeafRoute[] {
  const results: LeafRoute[] = [];
  for (const entry of manifest.values()) {
    if (!entry.isLeaf) {
      continue;
    }
    results.push({
      id: entry.id,
      file: entry.file,
      urlPattern: entry.fullPath,
      layoutChain: getLayoutChain(manifest, entry.id),
      params: extractParams(entry.fullPath),
    });
  }
  results.sort((a, b) => {
    if (a.urlPattern < b.urlPattern) return -1;
    if (a.urlPattern > b.urlPattern) return 1;
    return 0;
  });
  return results;
}

/**
 * Match a URL against the manifest using React Router's own `matchRoutes`. The returned
 * {@link UrlMatch} carries the resolved leaf entry, the full root → leaf layout chain, and the
 * extracted URL parameters.
 */
export function matchUrl(manifest: RouteManifest, url: string): UrlMatch | null {
  const tree = buildRouteTree(manifest);
  const matches = matchRoutes(tree, url);
  if (matches === null || matches.length === 0) {
    return null;
  }
  const leafMatch = matches[matches.length - 1];
  if (leafMatch === undefined) {
    return null;
  }
  const leafId = leafMatch.route.id;
  if (leafId === undefined) {
    return null;
  }
  const leafEntry = manifest.get(leafId);
  if (leafEntry === undefined) {
    return null;
  }
  return {
    leaf: leafEntry,
    layoutChain: getLayoutChain(manifest, leafId),
    params: leafMatch.params,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getDefaultExport(mod: Record<string, unknown>):
  | {
      success: true;
      value: unknown;
    }
  | {
      success: false;
    } {
  if (!isRecord(mod) || !("default" in mod)) {
    return {
      success: false,
    };
  }
  return {
    success: true,
    value: mod["default"],
  };
}
