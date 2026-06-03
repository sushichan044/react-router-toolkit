/**
 * Vendored (with light typing adjustments) from React Router's `@react-router/dev` config
 * internals, which are not part of its public API. React Router is MIT-licensed (Copyright Remix
 * Software Inc., Shopify Inc.).
 *
 * Upstream source: packages/react-router-dev/config/routes.ts (react-router v7.15.1)
 * https://github.com/remix-run/react-router/blob/main/packages/react-router-dev/config/routes.ts
 *
 * Vendoring this verbatim keeps the toolkit's route validation and resolved manifest (route ids,
 * app-relative file paths, parent links) byte-for-byte aligned with what React Router itself routes
 * on — including quirks such as absolute ids produced by the `relative()` helper, and the
 * `validateRouteConfig` valibot schema (e.g. the reserved `root` id rejection).
 *
 * Toolkit-specific changes vs. upstream: - Removed the `route`/`index`/`layout`/`prefix`/`relative`
 * helpers and `getAppDirectory`/ `setAppDirectory`: those are imported by the user's own
 * `routes.ts` from `@react-router/dev/routes` and are evaluated inside the user's project, so the
 * toolkit does not re-implement them. This also drops the upstream `lodash/pick` and `invariant`
 * dependencies.
 */

import * as Path from "pathe";
import * as v from "valibot";

export interface RouteManifestEntry {
  /** The path this route uses to match on the URL pathname. */
  path?: string;

  /** Should be `true` if it is an index route. This disallows child routes. */
  index?: boolean;

  /** Should be `true` if the `path` is case-sensitive. Defaults to `false`. */
  caseSensitive?: boolean;

  /**
   * The unique id for this route, named like its `file` but without the extension. So
   * `app/routes/gists/$username.tsx` will have an `id` of `routes/gists/$username`.
   */
  id: string;

  /** The unique `id` for this route's parent route, if there is one. */
  parentId?: string;

  /** The path to the entry point for this route, relative to `config.appDirectory`. */
  file: string;
}

export interface RouteManifest {
  [routeId: string]: RouteManifestEntry;
}

/**
 * Configuration for an individual route, for use within `routes.ts`. As a convenience, route config
 * entries can be created with the {@link route}, {@link index} and {@link layout} helper
 * functions.
 */
export interface RouteConfigEntry {
  /** The unique id for this route. */
  id?: string;

  /** The path this route uses to match on the URL pathname. */
  path?: string;

  /** Should be `true` if it is an index route. This disallows child routes. */
  index?: boolean;

  /** Should be `true` if the `path` is case-sensitive. Defaults to `false`. */
  caseSensitive?: boolean;

  /** The path to the entry point for this route, relative to `config.appDirectory`. */
  file: string;

  /** The child routes. */
  children?: RouteConfigEntry[];
}

export const routeConfigEntrySchema: v.BaseSchema<
  RouteConfigEntry,
  any,
  v.BaseIssue<unknown>
> = v.pipe(
  v.custom<RouteConfigEntry>((value) => {
    return !(typeof value === "object" && value !== null && "then" in value && "catch" in value);
  }, "Invalid type: Expected object but received a promise. Did you forget to await?"),
  v.object({
    id: v.optional(
      v.pipe(v.string(), v.notValue("root", "A route cannot use the reserved id 'root'.")),
    ),
    path: v.optional(v.string()),
    index: v.optional(v.boolean()),
    caseSensitive: v.optional(v.boolean()),
    file: v.string(),
    children: v.optional(v.array(v.lazy(() => routeConfigEntrySchema))),
  }),
);

export const resolvedRouteConfigSchema = v.array(routeConfigEntrySchema);
type ResolvedRouteConfig = v.InferInput<typeof resolvedRouteConfigSchema>;

/** Route config to be exported via the default export from `app/routes.ts`. */
export type RouteConfig = ResolvedRouteConfig | Promise<ResolvedRouteConfig>;

export function validateRouteConfig({
  routeConfigFile,
  routeConfig,
}: {
  routeConfigFile: string;
  routeConfig: unknown;
}): { valid: false; message: string } | { valid: true; routeConfig: RouteConfigEntry[] } {
  if (!routeConfig) {
    return {
      valid: false,
      message: `Route config must be the default export in "${routeConfigFile}".`,
    };
  }

  if (!Array.isArray(routeConfig)) {
    return {
      valid: false,
      message: `Route config in "${routeConfigFile}" must be an array.`,
    };
  }

  let { issues } = v.safeParse(resolvedRouteConfigSchema, routeConfig);

  if (issues?.length) {
    let { root, nested } = v.flatten(issues);
    return {
      valid: false,
      message: [
        `Route config in "${routeConfigFile}" is invalid.`,
        root ? `${root}` : [],
        nested
          ? Object.entries(nested).map(([path, message]) => `Path: routes.${path}\n${message}`)
          : [],
      ]
        .flat()
        .join("\n\n"),
    };
  }

  return {
    valid: true,
    routeConfig: routeConfig as RouteConfigEntry[],
  };
}

export function configRoutesToRouteManifest(
  appDirectory: string,
  routes: RouteConfigEntry[],
): RouteManifest {
  let routeManifest: RouteManifest = {};

  function walk(route: RouteConfigEntry, parentId?: string) {
    let id = route.id || createRouteId(route.file);
    let manifestItem: RouteManifestEntry = {
      id,
      parentId,
      file: Path.isAbsolute(route.file) ? Path.relative(appDirectory, route.file) : route.file,
      path: route.path,
      index: route.index,
      caseSensitive: route.caseSensitive,
    };

    if (routeManifest.hasOwnProperty(id)) {
      throw new Error(`Unable to define routes with duplicate route id: "${id}"`);
    }
    routeManifest[id] = manifestItem;

    if (route.children) {
      for (let child of route.children) {
        walk(child, id);
      }
    }
  }

  for (let route of routes) {
    walk(route);
  }

  return routeManifest;
}

function createRouteId(file: string) {
  return Path.normalize(stripFileExtension(file));
}

function stripFileExtension(file: string) {
  return file.replace(/\.[a-z0-9]+$/i, "");
}
