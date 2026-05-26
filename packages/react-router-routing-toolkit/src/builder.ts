import fs from "node:fs";
import nodePath, { posix as posixPath } from "node:path";

import type {
  BranchRouteNode,
  IndexRouteNode,
  LayoutRouteNode,
  LeafRouteNode,
  RouteConfigEntry,
  RouteNode,
  RouteTree,
} from "./types";
import { RouteManifestError } from "./types";

const ROUTE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mts", ".cts", ".mjs", ".cjs"] as const;

const ROOT_ID = "root" as const;
const ROOT_FULL_PATH = "/" as const;

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
 * app-directory-relative POSIX paths so each node's `file` and `id` fields stay short and
 * portable.
 */
function normaliseFile(file: string, appDirectory: string): string {
  if (nodePath.isAbsolute(file)) {
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
 * Locate `app/root.tsx` (or another supported route module extension) under `appDirectory`.
 *
 * React Router framework mode requires the file to exist; the toolkit reflects that constraint by
 * throwing {@link RouteManifestError} when none of the candidate extensions are present.
 *
 * Returns the app-directory-relative POSIX path with extension preserved.
 */
function resolveRootFile(appDirectory: string): string {
  for (const ext of ROUTE_EXTENSIONS) {
    const candidate = `root${ext}`;
    if (fs.existsSync(nodePath.join(appDirectory, candidate))) {
      return candidate;
    }
  }
  throw new RouteManifestError(
    `Could not find "root" route module under "${appDirectory}". ` +
      `React Router framework mode requires app/root.{tsx,jsx,ts,js,mts,cts,mjs,cjs}.`,
  );
}

/** Options accepted by {@link buildRouteTree}. */
export interface BuildRouteTreeOptions {
  /**
   * Absolute path of the application directory (commonly `${root}/app`).
   *
   * Used for two things: 1. Rewriting absolute entry paths back to POSIX paths relative to this
   * directory. 2. Locating the `root` route module on disk to materialise the synthesized tree
   * root.
   */
  readonly appDirectory: string;
}

/**
 * Build a {@link RouteTree} from the `RouteConfigEntry[]` produced by `app/routes.ts`.
 *
 * The returned tree is always single-rooted: a synthesized {@link LayoutRouteNode} representing
 * `app/root.tsx` sits at the top, wrapping every entry written in `routes.ts`. This mirrors what
 * React Router does internally when assembling its route manifest.
 *
 * @throws {RouteManifestError} - When two entries resolve to the same id, or any entry uses the
 *   reserved id `"root"`.
 *
 *   - When `app/root.tsx` (or another supported extension) cannot be located under `appDirectory`.
 *   - When an entry is structurally invalid (no `path`, no `index`, and no `children`).
 */
export function buildRouteTree(
  entries: readonly RouteConfigEntry[],
  options: BuildRouteTreeOptions,
): RouteTree {
  const { appDirectory } = options;
  const rootFile = resolveRootFile(appDirectory);
  const seenIds = new Set<string>();
  seenIds.add(ROOT_ID);

  function walk(entry: RouteConfigEntry, parentId: string, parentFullPath: string): RouteNode {
    const file = normaliseFile(entry.file, appDirectory);
    const id = resolveId(file, entry.id);

    if (id === ROOT_ID) {
      throw new RouteManifestError(
        `Route id "${ROOT_ID}" is reserved for the synthesized root layout (app/root.tsx). ` +
          `Provide an explicit \`id\` on the route to disambiguate.`,
        { conflictingId: ROOT_ID },
      );
    }
    if (seenIds.has(id)) {
      throw new RouteManifestError(
        `Duplicate route id "${id}". Provide an explicit \`id\` to disambiguate.`,
        { conflictingId: id },
      );
    }
    seenIds.add(id);

    const ownPath = entry.path;
    const isIndex = entry.index === true;
    // `prefix()` rewrites a wrapped `index()` entry so it carries a `path`;
    // the URL pattern follows whatever `path` is present, regardless of `index`.
    const fullPath = ownPath === undefined ? parentFullPath : joinPaths(parentFullPath, ownPath);
    const params = extractParams(fullPath);
    const caseSensitive = entry.caseSensitive === true;
    const rawChildren = entry.children ?? [];
    const hasChildren = rawChildren.length > 0;
    const hasOwnPath = typeof ownPath === "string";

    if (isIndex) {
      const node: IndexRouteNode = {
        kind: "index",
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

    if (hasChildren && !hasOwnPath) {
      const children = rawChildren.map((child) => walk(child, id, fullPath));
      const node: LayoutRouteNode = {
        kind: "layout",
        id,
        parentId,
        file,
        fullPath,
        caseSensitive,
        params,
        children,
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
      const children = rawChildren.map((child) => walk(child, id, fullPath));
      const node: BranchRouteNode = {
        kind: "branch",
        id,
        parentId,
        file,
        path: ownPath,
        fullPath,
        caseSensitive,
        params,
        children,
      };
      return node;
    }

    throw new RouteManifestError(
      `Route entry "${id}" is structurally invalid: it has no \`path\`, no \`index\`, and no ` +
        `\`children\`. Such an entry can never match.`,
      { conflictingId: id },
    );
  }

  const children = entries.map((entry) => walk(entry, ROOT_ID, ROOT_FULL_PATH));

  const root: RouteTree = {
    kind: "layout",
    id: ROOT_ID,
    parentId: undefined,
    file: rootFile,
    fullPath: ROOT_FULL_PATH,
    caseSensitive: false,
    params: [],
    children,
  };

  return root;
}
