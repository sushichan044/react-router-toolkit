import { RouteManifestError } from "./errors";
import type {
  BranchRouteNode,
  IndexRouteNode,
  LayoutRouteNode,
  LeafRouteNode,
  RouteManifest,
  RouteManifestEntry,
  RouteNode,
  RouteTree,
} from "./types";

const ROOT_FULL_PATH = "/" as const;

function joinPaths(parent: string, segment: string): string {
  const base = parent.endsWith("/") ? parent : `${parent}/`;
  const joined = `${base}${segment}`.replace(/\/+/g, "/");
  if (joined.length > 1 && joined.endsWith("/")) {
    return joined.slice(0, -1);
  }
  return joined;
}

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
 * Assemble React Router's flat {@link RouteManifest} into a single-rooted {@link RouteTree}.
 *
 * The manifest comes straight from React Router's own config loader (via `resolveRouteManifest`),
 * so every `id`, `file`, and `path` is used verbatim — the toolkit does not re-derive or
 * re-normalise them. The synthesized `root` entry (the one without a `parentId`) becomes the tree
 * root; all other entries are linked to their parent through `parentId`, preserving the manifest's
 * insertion order among siblings.
 *
 * @throws {RouteManifestError} When the manifest has no root entry, or an entry is structurally
 *   invalid (no `path`, no `index`, and no children — it could never match).
 */
export function buildRouteTree(manifest: RouteManifest): RouteTree {
  const childrenByParent = new Map<string, RouteManifestEntry[]>();
  let rootEntry: RouteManifestEntry | undefined;

  for (const entry of Object.values(manifest)) {
    if (entry.parentId === undefined) {
      rootEntry = entry;
      continue;
    }
    const siblings = childrenByParent.get(entry.parentId);
    if (siblings === undefined) {
      childrenByParent.set(entry.parentId, [entry]);
    } else {
      siblings.push(entry);
    }
  }

  if (rootEntry === undefined) {
    throw new RouteManifestError(
      "Route manifest has no root entry (an entry without `parentId`). " +
        "React Router synthesizes a `root` entry for app/root.tsx; its absence indicates an " +
        "unexpected manifest shape.",
    );
  }

  function buildChildren(parentId: string, parentFullPath: string): RouteNode[] {
    return (childrenByParent.get(parentId) ?? []).map((entry) => buildNode(entry, parentFullPath));
  }

  function buildNode(entry: RouteManifestEntry, parentFullPath: string): RouteNode {
    const { id, file, path: ownPath } = entry;
    // React Router represents the root's pathless segment as `""`; treat that the same as "no path".
    const hasOwnPath = ownPath !== undefined && ownPath !== "";
    const fullPath = hasOwnPath ? joinPaths(parentFullPath, ownPath) : parentFullPath;
    const params = extractParams(fullPath);
    const caseSensitive = entry.caseSensitive === true;
    const parentId = entry.parentId as string;
    const hasChildren = childrenByParent.has(id);

    if (entry.index === true) {
      const node: IndexRouteNode = {
        kind: "index",
        id,
        parentId,
        file,
        // `prefix()` can give a wrapped index its own path; a bare `index()` leaves it undefined.
        path: ownPath,
        fullPath,
        caseSensitive,
        params,
      };
      return node;
    }

    if (hasChildren && !hasOwnPath) {
      const node: LayoutRouteNode = {
        kind: "layout",
        id,
        parentId,
        file,
        fullPath,
        caseSensitive,
        params,
        children: buildChildren(id, fullPath),
      };
      return node;
    }

    if (hasOwnPath && !hasChildren) {
      const node: LeafRouteNode = {
        kind: "leaf",
        id,
        parentId,
        file,
        path: ownPath,
        fullPath,
        caseSensitive,
        params,
      };
      return node;
    }

    if (hasOwnPath && hasChildren) {
      const node: BranchRouteNode = {
        kind: "branch",
        id,
        parentId,
        file,
        path: ownPath,
        fullPath,
        caseSensitive,
        params,
        children: buildChildren(id, fullPath),
      };
      return node;
    }

    throw new RouteManifestError(
      `Route entry "${id}" is structurally invalid: it has no \`path\`, no \`index\`, and no ` +
        `\`children\`. Such an entry can never match.`,
      { conflictingId: id },
    );
  }

  const root: RouteTree = {
    kind: "layout",
    id: "root",
    parentId: undefined,
    file: rootEntry.file,
    fullPath: ROOT_FULL_PATH,
    caseSensitive: rootEntry.caseSensitive === true,
    params: [],
    children: buildChildren(rootEntry.id, ROOT_FULL_PATH),
  };

  return root;
}
