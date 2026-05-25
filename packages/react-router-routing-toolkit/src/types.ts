/**
 * A single route entry as returned by React Router's `route()`, `index()`, `layout()`, and
 * `prefix()` helpers from `@react-router/dev/routes`.
 *
 * We define this structurally instead of importing it from `@react-router/dev` because that
 * package's `RouteConfigEntry` type is part of an internal module surface and not covered by the
 * package's public type stability guarantees. The runtime shape matches what those helpers actually
 * return.
 */
export interface RouteConfigEntry {
  readonly id?: string;
  readonly path?: string;
  readonly index?: boolean;
  readonly caseSensitive?: boolean;
  readonly file: string;
  readonly children?: readonly RouteConfigEntry[];
}

/** A single entry in the flattened {@link RouteManifest}. */
export interface RouteManifestEntry {
  /** Explicit `id` from `routes.ts`, otherwise `path.normalize(stripExt(file))`. */
  readonly id: string;
  /** Parent route id. Top-level entries have `undefined`. */
  readonly parentId: string | undefined;
  /** `app/` relative path of the route module file. */
  readonly file: string;
  /** The route's own path segment. `undefined` for layout and index entries. */
  readonly path: string | undefined;
  readonly index: boolean;
  readonly caseSensitive: boolean;
  /**
   * Full URL pattern from the application root to this entry. Index and layout entries inherit
   * their parent's `fullPath`.
   */
  readonly fullPath: string;
  /**
   * True when this entry can be matched as a leaf — either an `index` entry or an entry without
   * children.
   */
  readonly isLeaf: boolean;
  /**
   * True when this entry acts purely as a layout — has children but no `path` of its own and is not
   * an index.
   */
  readonly isLayout: boolean;
}

/**
 * Flattened `id` → {@link RouteManifestEntry} map. Insertion order is depth-first: a parent always
 * appears before its children.
 */
export type RouteManifest = ReadonlyMap<string, RouteManifestEntry>;

/**
 * One step in the layout chain returned by {@link RouteManifest} consumers. Chains are ordered from
 * root (index 0) down to the leaf.
 */
export interface LayoutChainEntry {
  readonly id: string;
  readonly file: string;
  readonly isLayout: boolean;
  readonly isIndex: boolean;
}

/** One enumerated leaf route, suitable for "list every URL in the app" reports. */
export interface LeafRoute {
  readonly id: string;
  readonly file: string;
  /** Fully-resolved URL pattern, e.g. `/concerts/:city`. */
  readonly urlPattern: string;
  /** Root → leaf layout chain (leaf included as the last element). */
  readonly layoutChain: readonly LayoutChainEntry[];
  /**
   * Dynamic parameter names extracted from `urlPattern`. Splat segments appear as the literal
   * `"*"`.
   */
  readonly params: readonly string[];
}

/** Result of matching a URL against the manifest. */
export interface UrlMatch {
  readonly leaf: RouteManifestEntry;
  readonly layoutChain: readonly LayoutChainEntry[];
  readonly params: Readonly<Record<string, string | undefined>>;
}

/**
 * Options accepted by {@link "./index.ts".createRouteManifest} and
 * {@link "./index.ts".evaluateRoutesFile}.
 *
 * The user project must have a `vite.config.ts` registering the React Router Vite plugin
 * (`@react-router/dev/vite`); the toolkit relies on that plugin to configure
 * `globalThis.__reactRouterAppDirectory` before `routes.ts` is evaluated. The routes file is always
 * resolved to `${root}/app/routes.ts` — customising the filename is intentionally not supported.
 */
export interface CreateRouteManifestOptions {
  /**
   * Vite `root`. Defaults to `process.cwd()`. The routes file is always resolved to
   * `${root}/app/routes.ts`, and Vite is left to its default `vite.config.ts` search rooted here.
   */
  readonly root?: string;
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

/** Thrown when flattening the evaluated route tree fails (e.g. duplicate id). */
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
