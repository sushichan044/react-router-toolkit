/**
 * Base class for all errors produced by `react-router-toolkit`. Subclassed by
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

export class ReactRouterConfigError extends RouteToolkitError {
  override readonly kind: "react-router-config";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { kind: "react-router-config", cause: options?.cause });
    this.kind = "react-router-config";
    this.name = "ReactRouterConfigError";
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

/** Thrown when an evaluated module's default export is not a valid route config. */
export class RouteValidationError extends RouteToolkitError {
  override readonly kind: "validation";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { kind: "validation", cause: options?.cause });
    this.kind = "validation";
    this.name = "RouteValidationError";
  }
}

/**
 * Thrown by {@link flattenRouteTree} when two distinct path routes resolve to the same URL, which
 * makes the URL → layout mapping ambiguous. (An index route sharing its parent's URL is expected
 * and does not trigger this.)
 */
export class RouteLayoutConflictError extends RouteToolkitError {
  override readonly kind: "layout-conflict";
  readonly url: string;

  constructor(message: string, options: { url: string; cause?: unknown }) {
    super(message, { kind: "layout-conflict", cause: options.cause });
    this.kind = "layout-conflict";
    this.url = options.url;
    this.name = "RouteLayoutConflictError";
  }
}

type RouteToolkitErrorKind =
  | "evaluation"
  | "manifest"
  | "validation"
  | "react-router-config"
  | "layout-conflict";
