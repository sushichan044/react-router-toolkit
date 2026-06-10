import { create, RealFSProvider } from "@platformatic/vfs";
import type { VirtualFileSystem } from "@platformatic/vfs";
import { matchRoutes } from "react-router";
import type { RouteObject } from "react-router";

import type { RouteConfigEntry } from "./vendor/react-router/config/routes";

export type RouteMatchResult = {
  /** Full URL pattern of the matched leaf route, segments kept verbatim (e.g. `/concerts/:city`). */
  pattern: string;
  /** File of the route rendered as the page (relative to the app directory). */
  file: string;
  /** Layout files wrapping the page, ordered outermost → innermost (relative to the app directory). */
  layouts: string[];
  /** Dynamic segment values extracted from the pathname (splat rest under `"*"`). */
  params: Record<string, string | undefined>;
};

/**
 * Match a concrete URL pathname against a route config tree (as returned by `loadRoutes` or
 * imported straight from `app/routes.ts`) and describe the route that would render it: the full URL
 * pattern, the page file, the layout chain (outermost → innermost, same vocabulary as
 * `RouteLayoutInfo`), and the extracted params. Returns `null` when nothing matches.
 *
 * Matching delegates to React Router's own `matchRoutes`, so dynamic segments, optional segments,
 * splats, ranking, and case sensitivity behave exactly as they do at runtime. When several routes
 * match, the highest-ranked one wins — duplicate-definition detection is `flattenRouteTree`'s job.
 *
 * `pathname` must already be app-relative: strip any `basename` before calling.
 */
export function matchRoute(routes: RouteConfigEntry[], pathname: string): RouteMatchResult | null {
  // RouteConfigEntry carries every field matchRoutes reads (path/index/caseSensitive/children/id);
  // the cast only papers over RouteObject being a discriminated union on `index`.
  const matches = matchRoutes(routes as unknown as RouteObject[], pathname);
  if (matches === null || matches.length === 0) {
    return null;
  }

  const matched = matches.map((match) => match.route as unknown as RouteConfigEntry);
  const leaf = matches.at(-1)!;
  const segments = matched
    .map((route) => route.path)
    .filter((path): path is string => path !== undefined && path !== "");

  return {
    pattern: segments.length === 0 ? "/" : `/${segments.join("/")}`,
    file: matched.at(-1)!.file,
    layouts: matched.slice(0, -1).map((route) => route.file),
    params: { ...leaf.params },
  };
}

/**
 * Return the route files referenced by a route config tree that do not exist under `appDirectory`,
 * sorted for stable assertions. Layout-only files count, and a file registered by multiple routes
 * is checked and reported once.
 *
 * `files` is a filesystem rooted at `appDirectory`, defaulting to the real one — pass a
 * `MemoryProvider`-backed VFS to test against in-memory sources.
 */
export async function findMissingRouteFiles(
  routes: RouteConfigEntry[],
  appDirectory: string,
  files: VirtualFileSystem = create(new RealFSProvider(appDirectory), { moduleHooks: false }),
): Promise<string[]> {
  const uniqueFiles = [...new Set(collectFiles(routes))];
  const missing = await Promise.all(
    uniqueFiles.map(async (file) => {
      try {
        await files.promises.stat(`/${file}`);
        return null;
      } catch {
        return file;
      }
    }),
  );
  return missing.filter((file): file is string => file !== null).sort();
}

function collectFiles(routes: RouteConfigEntry[]): string[] {
  return routes.flatMap((route) => [route.file, ...collectFiles(route.children ?? [])]);
}
