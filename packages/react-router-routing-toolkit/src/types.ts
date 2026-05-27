import { UserConfig } from "vite";

/**
 * A single route entry as returned by React Router's `route()`, `index()`, `layout()`, and
 * `prefix()` helpers from `@react-router/dev/routes`.
 *
 * Defined structurally instead of importing from `@react-router/dev` because that package's
 * `RouteConfigEntry` type is part of an internal module surface and not covered by the package's
 * public type stability guarantees. The runtime shape matches what those helpers actually return.
 */
export interface RouteConfigEntry {
  readonly id?: string;
  readonly path?: string;
  readonly index?: boolean;
  readonly caseSensitive?: boolean;
  readonly file: string;
  readonly children?: readonly RouteConfigEntry[];
}

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

/**
 * Options accepted by `loadRouteTree` and `evaluateRoutesFile`.
 *
 * The user project must have a `vite.config.ts` registering the React Router Vite plugin
 * (`@react-router/dev/vite`); the toolkit relies on that plugin to configure
 * `globalThis.__reactRouterAppDirectory` before `routes.ts` is evaluated. The routes file is always
 * resolved to `${root}/app/routes.ts` — customising the filename is intentionally not supported.
 */
export interface LoadRoutesOptions {
  /**
   * Vite settings used when evaluating `app/routes.ts`. Use `define` with a dedicated `import.meta`
   * or `import.meta.env` property when the route configuration must vary per evaluation; the
   * evaluator does not inject or override `process.env`.
   */
  readonly vite?: Pick<UserConfig, "define" | "root">;
}

type RouteToolkitErrorKind = "evaluation" | "manifest" | "validation";

/**
 * Base class for all errors produced by `react-router-routing-toolkit`. Subclassed by
 * {@link RouteEvaluationError}, {@link RouteManifestError}, and {@link RouteValidationError}; use
 * `instanceof RouteToolkitError` to catch any toolkit-originating failure.
 */
export class RouteToolkitError extends Error {
  readonly kind: RouteToolkitErrorKind;

  constructor(message: string, options: { kind: RouteToolkitErrorKind; cause?: unknown }) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.kind = options.kind;
    this.name = "RouteToolkitError";
  }
}

/** Thrown when `app/routes.ts` cannot be loaded or evaluated. */
export class RouteEvaluationError extends RouteToolkitError {
  override readonly kind: "evaluation";
  readonly file: string;

  constructor(message: string, options: { file: string; cause?: unknown }) {
    super(message, { kind: "evaluation", cause: options.cause });
    this.kind = "evaluation";
    this.file = options.file;
    this.name = "RouteEvaluationError";
  }
}

/**
 * Thrown when assembling the route tree fails — duplicate ids, conflict with the synthesized
 * `"root"` id, or `app/root.tsx` not present on disk.
 */
export class RouteManifestError extends RouteToolkitError {
  override readonly kind: "manifest";
  readonly conflictingId: string | undefined;

  constructor(message: string, options?: { conflictingId?: string; cause?: unknown }) {
    super(message, { kind: "manifest", cause: options?.cause });
    this.kind = "manifest";
    this.conflictingId = options?.conflictingId;
    this.name = "RouteManifestError";
  }
}

/** Thrown when the evaluated module's default export is not a valid route config. */
export class RouteValidationError extends RouteToolkitError {
  override readonly kind: "validation";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { kind: "validation", cause: options?.cause });
    this.kind = "validation";
    this.name = "RouteValidationError";
  }
}
