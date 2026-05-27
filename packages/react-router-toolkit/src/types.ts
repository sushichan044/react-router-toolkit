import type { RouteConfigEntry } from "@react-router/dev/routes";
import { UserConfig } from "vite";

export type { RouteConfigEntry };

/**
 * A single entry of React Router's resolved route manifest (`id` → entry).
 *
 * This mirrors React Router's internal `RouteManifestEntry`, which is **not** part of
 * `@react-router/dev`'s public type exports. Every field here is already fully resolved by React
 * Router's own config loader:
 *
 * - `file` is an `appDirectory`-relative POSIX path.
 * - `path` has `prefix()` segments merged in (e.g. `concerts/:city`).
 * - `id` is React Router's own identifier (`route.id` when given, otherwise derived from `file` —
 *   which means it can be an absolute path when the `relative()` helper is used).
 * - `parentId` references another entry's `id`; only the synthesized `root` entry omits it.
 */
export interface RouteManifestEntry {
  readonly id: string;
  readonly parentId?: string;
  readonly file: string;
  readonly path?: string;
  readonly index?: boolean;
  readonly caseSensitive?: boolean;
}

/** React Router's flat route manifest, keyed by route `id`. */
export type RouteManifest = Readonly<Record<string, RouteManifestEntry>>;

interface RouteNodeBase {
  readonly id: string;
  /** Parent node id. Only the synthesized root has `undefined`. */
  readonly parentId: string | undefined;
  /** `app/`-relative POSIX path of the route module file. */
  readonly file: string;
  /** Fully-resolved URL pattern from the application root to this node. */
  readonly fullPath: string;
  readonly caseSensitive: boolean;
  /** Dynamic parameter names extracted from `fullPath`. Splat segments appear as the literal `"*"`. */
  readonly params: readonly string[];
}

/**
 * An `index` route — terminal (no children).
 *
 * `path` is `undefined` for a bare `index()` call, and a string when produced by `prefix("X",
 * [index(...)])` (React Router rewrites the wrapped index to carry the prefix path).
 */
export interface IndexRouteNode extends RouteNodeBase {
  readonly kind: "index";
  readonly path: string | undefined;
}

/**
 * A pathless wrapper route with children — used by `layout()` and by the synthesized `app/root.tsx`
 * sitting at the top of every tree.
 */
export interface LayoutRouteNode extends RouteNodeBase {
  readonly kind: "layout";
  /** Always non-empty. */
  readonly children: readonly RouteNode[];
}

/** A terminal route with its own path segment — `route(path, file)` with no children. */
export interface LeafRouteNode extends RouteNodeBase {
  readonly kind: "leaf";
  readonly path: string;
}

/** A wrapper route that also carries its own path segment — `route(path, file, [...children])`. */
export interface BranchRouteNode extends RouteNodeBase {
  readonly kind: "branch";
  readonly path: string;
  /** Always non-empty. */
  readonly children: readonly RouteNode[];
}

/** Any node in a {@link RouteTree}. Discriminated by `kind`. */
export type RouteNode = IndexRouteNode | LayoutRouteNode | LeafRouteNode | BranchRouteNode;

/**
 * The root of a complete route tree.
 *
 * Materialised by `buildRouteTree` / `loadRouteTree` as a synthesized layout representing
 * `app/root.tsx` (React Router framework mode requires this file). The type narrows
 * {@link LayoutRouteNode} with the root-only invariants that the synthesizer guarantees:
 *
 * - `id` is the reserved literal `"root"`
 * - `parentId` is `undefined` (no parent above)
 * - `fullPath` is the literal `"/"` (the application origin)
 *
 * Sub-trees rooted at any other node are typed as {@link RouteNode}, not `RouteTree`. Only the
 * synthesized root carries this brand, which is why `listRoutes` and `matchUrl` take `RouteTree`
 * rather than `RouteNode` — they semantically operate on the whole app, not on an arbitrary
 * subtree.
 */
export interface RouteTree extends LayoutRouteNode {
  readonly id: "root";
  readonly parentId: undefined;
  readonly fullPath: "/";
}

/**
 * Id → node lookup derived from a {@link RouteTree}. Built via `buildRouteIndex(tree)`.
 *
 * Insertion order is depth-first: the root appears first, then each parent before its children.
 */
export type RouteIndex = ReadonlyMap<string, RouteNode>;

/** Nodes that match as the leaf of a URL match — `index` or `leaf`. */
export type TerminalRouteNode = IndexRouteNode | LeafRouteNode;

/** Nodes that wrap children — `layout` or `branch`. */
export type WrapperRouteNode = LayoutRouteNode | BranchRouteNode;

/**
 * Nodes that do not contribute their own path segment.
 *
 * `LayoutRouteNode` is always pathless; `IndexRouteNode` is pathless when `path === undefined`
 * (i.e., a bare `index()` that did not pass through `prefix()`).
 */
export type PathlessRouteNode = LayoutRouteNode | (IndexRouteNode & { readonly path: undefined });

/**
 * Nodes that carry their own path segment.
 *
 * `LeafRouteNode` and `BranchRouteNode` are always pathful; `IndexRouteNode` is pathful when it
 * came out of `prefix("X", [index(...)])`.
 */
export type PathfulRouteNode =
  | LeafRouteNode
  | BranchRouteNode
  | (IndexRouteNode & { readonly path: string });

/** Result of matching a URL against a {@link RouteTree}. */
export interface UrlMatch {
  /** The matched terminal node. */
  readonly terminal: TerminalRouteNode;
  /**
   * Root → terminal node stack. Always starts with the synthesized root layout and ends with
   * {@link terminal}.
   */
  readonly renderChain: readonly RouteNode[];
  /** Extracted URL parameters. */
  readonly params: Readonly<Record<string, string | undefined>>;
}

export interface LoadRoutesOptions {
  /** @default `process.cwd()` (project root, expected to contain `vite.config.*` and `app/`) */
  readonly root?: string;
  readonly vite?: Pick<UserConfig, "define">;
}

/**
 * React Router's resolved routing config, as captured from the `reactRouter()` Vite plugin.
 *
 * Returned by `resolveRouteManifest`.
 */
export interface ResolvedRouteManifest {
  /** Absolute path of the application directory (React Router's resolved `appDirectory`). */
  readonly appDirectory: string;
  /** React Router's flat route manifest. */
  readonly routes: RouteManifest;
}
