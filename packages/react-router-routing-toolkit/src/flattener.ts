import nodePath, { posix as posixPath } from "node:path";

import type { RouteConfigEntry, RouteManifest, RouteManifestEntry } from "./types";
import { RouteManifestError } from "./types";

const ROUTE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"] as const;

function stripRouteExtension(file: string): string {
  for (const ext of ROUTE_EXTENSIONS) {
    if (file.endsWith(ext)) {
      return file.slice(0, -ext.length);
    }
  }
  return file;
}

/**
 * Normalise `entry.file` against `appDirectory`.
 *
 * React Router's `relative()` helper from `@react-router/dev/routes` calls `Path.resolve(directory,
 * file)` internally, so entries produced through it arrive here with absolute file paths. We mirror
 * the behaviour of React Router's own `configRoutesToRouteManifest` and rewrite those back to
 * app-directory-relative POSIX paths so the manifest's `file` and `id` fields stay short and
 * portable.
 */
function normaliseFile(file: string, appDirectory: string | undefined): string {
  if (appDirectory !== undefined && nodePath.isAbsolute(file)) {
    return nodePath.relative(appDirectory, file).split(nodePath.sep).join("/");
  }
  return file;
}

function resolveId(file: string, explicitId: string | undefined): string {
  if (explicitId !== undefined && explicitId !== "") {
    return explicitId;
  }
  return posixPath.normalize(stripRouteExtension(file));
}

function joinPaths(parent: string, segment: string): string {
  const base = parent.endsWith("/") ? parent : `${parent}/`;
  const joined = `${base}${segment}`.replace(/\/+/g, "/");
  if (joined.length > 1 && joined.endsWith("/")) {
    return joined.slice(0, -1);
  }
  return joined;
}

/** Options accepted by {@link flattenToManifest}. */
export interface FlattenToManifestOptions {
  /**
   * Absolute path of the application directory (commonly `${root}/app`).
   *
   * When provided, every entry whose `file` arrives as an absolute path is rewritten to a POSIX
   * path relative to this directory. Pass `undefined` to preserve `entry.file` exactly as the route
   * config emitted it.
   */
  readonly appDirectory?: string;
}

/**
 * Flatten the tree returned by `routes.ts` into a depth-first ordered `id → RouteManifestEntry`
 * map.
 *
 * Insertion order guarantees every parent appears before its children, which consumers (e.g.
 * {@link "./utils.ts".matchUrl}) rely on when rebuilding the tree.
 *
 * @throws {RouteManifestError} When two entries resolve to the same id
 */
export function flattenToManifest(
  entries: readonly RouteConfigEntry[],
  options: FlattenToManifestOptions = {},
): RouteManifest {
  const { appDirectory } = options;
  const map = new Map<string, RouteManifestEntry>();

  function walk(
    entry: RouteConfigEntry,
    parentId: string | undefined,
    parentFullPath: string,
  ): void {
    const file = normaliseFile(entry.file, appDirectory);
    const id = resolveId(file, entry.id);

    if (map.has(id)) {
      throw new RouteManifestError(
        `Duplicate route id "${id}". Provide an explicit \`id\` to disambiguate.`,
        { conflictingId: id },
      );
    }

    const ownPath = entry.path;
    const isIndex = entry.index === true;
    // `prefix()` rewrites a wrapped `index()` entry so it carries a `path`;
    // the URL pattern follows whatever `path` is present, regardless of `index`.
    const fullPath = ownPath === undefined ? parentFullPath : joinPaths(parentFullPath, ownPath);

    const children = entry.children ?? [];
    const hasChildren = children.length > 0;
    const isLeaf = isIndex || !hasChildren;
    const isLayout = !isIndex && ownPath === undefined && hasChildren;

    const manifestEntry: RouteManifestEntry = {
      id,
      parentId,
      file,
      path: ownPath,
      index: isIndex,
      caseSensitive: entry.caseSensitive === true,
      fullPath,
      isLeaf,
      isLayout,
    };

    map.set(id, manifestEntry);

    for (const child of children) {
      walk(child, id, fullPath);
    }
  }

  for (const entry of entries) {
    walk(entry, undefined, "/");
  }

  return map;
}
