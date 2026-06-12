import { matchRoutes } from "react-router";
import type { RouteObject } from "react-router";

import type { RouteManifest, RouteManifestEntry } from "./vendor/react-router/config/routes";

/**
 * A token in a parsed path template. Either a literal string segment or a dynamic expression
 * placeholder (from a template literal `${...}` expression).
 */
export type PathTemplateToken =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "dynamic" };

/**
 * The result of parsing a path template: an ordered list of tokens that describe the structure of
 * the path, alternating literal text and dynamic expression slots.
 */
export type ParsedPathTemplate = readonly PathTemplateToken[];

/**
 * Parse a template literal (or a plain string literal) into an ordered list of tokens.
 *
 * For a plain string literal, pass `quasis = [value]` and `expressionCount = 0`. For a template
 * literal `` `/shops/${id}/products` ``, pass `quasis = ["/shops/", "/products"]` and
 * `expressionCount = 1`.
 *
 * Empty quasi strings are included as `{ kind: "literal", value: "" }` tokens, which are then
 * collapsed away before matching.
 */
export function parsePathTemplate(
  quasis: readonly string[],
  expressionCount: number,
): ParsedPathTemplate {
  const tokens: PathTemplateToken[] = [];
  for (let i = 0; i < quasis.length; i++) {
    tokens.push({ kind: "literal", value: quasis[i]! });
    if (i < expressionCount) {
      tokens.push({ kind: "dynamic" });
    }
  }
  return tokens;
}

/**
 * Build a route tree (children-nested `RouteObject[]`) from a flat `RouteManifest` as produced by
 * `buildRouteManifest` / `configRoutesToRouteManifest`. The manifest must include the synthesized
 * `root` entry (id `"root"`, path `""`); that entry becomes the tree's root wrapper.
 *
 * The returned array is suitable for passing to React Router's `matchRoutes`.
 */
export function buildRouteTreeFromManifest(routes: RouteManifest): RouteObject[] {
  // Build a map of id → children list first, then attach each entry to its parent.
  const childrenMap = new Map<string, RouteObject[]>();
  const objectMap = new Map<string, RouteObject>();

  for (const entry of Object.values(routes)) {
    const obj = manifestEntryToRouteObject(entry);
    objectMap.set(entry.id, obj);
    childrenMap.set(entry.id, []);
  }

  const roots: RouteObject[] = [];
  for (const entry of Object.values(routes)) {
    if (entry.parentId === undefined) {
      roots.push(objectMap.get(entry.id)!);
    } else {
      const parentChildren = childrenMap.get(entry.parentId);
      if (parentChildren !== undefined) {
        parentChildren.push(objectMap.get(entry.id)!);
      }
    }
  }

  // Attach children arrays to each RouteObject.
  for (const [id, children] of childrenMap) {
    const obj = objectMap.get(id)!;
    if (children.length > 0) {
      obj.children = children;
    }
  }

  return roots;
}

function manifestEntryToRouteObject(entry: RouteManifestEntry): RouteObject {
  return {
    id: entry.id,
    path: entry.path,
    index: entry.index,
    caseSensitive: entry.caseSensitive,
  };
}

/**
 * Synthesise a concrete pathname from a `ParsedPathTemplate` by replacing every `{ kind: "dynamic"
 * }` token with a distinct placeholder segment (`__dyn0__`, `__dyn1__`, …) and concatenating all
 * tokens.
 *
 * Query strings (`?…`) and hashes (`#…`) are stripped before matching, because `matchRoutes` only
 * operates on the pathname portion.
 *
 * @remarks
 *   The placeholder segments match `:param` and `*` (splat) segments in a route pattern but will
 *   **not** match a static literal segment. This is a known limitation: a template literal whose
 *   expressions are used as literal path segments (e.g. a locale prefix held in a variable) will
 *   not be matched even when a matching static route exists. Document this at call sites.
 * @param basename - The React Router app basename (e.g. `"/app"` or `"/"`). When it is not `"/"`,
 *   matching is attempted both with the basename stripped and with the full path, so callers do not
 *   need to normalise the path in advance.
 */
export function matchesRoutePattern(
  routeTree: RouteObject[],
  template: ParsedPathTemplate,
  basename: string,
): boolean {
  for (const candidate of buildCandidatePathnames(template)) {
    // Strip query string and hash.
    const cleanPathname = stripQueryAndHash(candidate);

    if (matchRoutes(routeTree, cleanPathname) !== null) {
      return true;
    }

    // When the app has a non-root basename, also try matching after stripping the basename prefix.
    if (basename !== "/" && cleanPathname.startsWith(basename)) {
      const withoutBasename = cleanPathname.slice(basename.length) || "/";
      if (matchRoutes(routeTree, withoutBasename) !== null) {
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildPathname(template: ParsedPathTemplate): string | null {
  let dynCounter = 0;
  let result = "";
  for (const token of template) {
    if (token.kind === "literal") {
      result += token.value;
    } else {
      result += `__dyn${dynCounter++}__`;
    }
  }
  return result === "" ? null : result;
}

function buildCandidatePathnames(template: ParsedPathTemplate): string[] {
  const candidates: string[] = [];
  const full = buildPathname(template);
  if (full !== null) {
    candidates.push(full);
  }

  // A trailing dynamic expression may evaluate to an empty string or a query string
  // (e.g. `` `/${queryString}` `` where queryString is "" or "?a=1"), so the template also
  // describes the pathname without that final segment value. Empty literal tokens (template
  // literals always end with a quasi, possibly "") are ignored when locating the trailing
  // expression.
  const significant = template.filter((token) => token.kind === "dynamic" || token.value !== "");
  const last = significant[significant.length - 1];
  const previous = significant[significant.length - 2];
  const canOmitTrailingDynamic =
    last !== undefined &&
    last.kind === "dynamic" &&
    previous !== undefined &&
    previous.kind === "literal" &&
    (previous.value === "" ||
      previous.value.endsWith("/") ||
      previous.value.endsWith("?") ||
      previous.value.endsWith("#"));
  if (canOmitTrailingDynamic) {
    const withoutTrailing = buildPathname(significant.slice(0, -1));
    if (withoutTrailing !== null) {
      candidates.push(withoutTrailing);
    }
  }

  return candidates;
}

function stripQueryAndHash(pathname: string): string {
  const qIdx = pathname.indexOf("?");
  const hIdx = pathname.indexOf("#");
  let end = pathname.length;
  if (qIdx !== -1) end = Math.min(end, qIdx);
  if (hIdx !== -1) end = Math.min(end, hIdx);
  return pathname.slice(0, end) || "/";
}
