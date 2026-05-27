/**
 * Functions in this module are copied (with light typing adjustments) from React Router's
 * `@react-router/dev` config internals, which are not part of its public API. React Router is
 * MIT-licensed (Copyright Remix Software Inc., Shopify Inc.).
 *
 * Source: https://github.com/remix-run/react-router/blob/main/packages/react-router-dev/config -
 * `config/routes.ts` → `configRoutesToRouteManifest`, `createRouteId`, `setAppDirectory` -
 * `config/config.ts` → `mergeReactRouterConfig`
 *
 * Keeping the verbatim logic guarantees the toolkit's resolved manifest (route ids, app-relative
 * file paths, parent links, the synthesized `root` nesting) matches what React Router itself routes
 * on — including React Router quirks such as absolute ids produced by the `relative()` helper.
 */
import * as Path from "node:path";

import type { RouteConfigEntry } from "@react-router/dev/routes";

import type { RouteManifest, RouteManifestEntry } from "./types";

declare global {
  // Matches the global published by `@react-router/dev`'s `setAppDirectory`.
  // eslint-disable-next-line no-var
  var __reactRouterAppDirectory: string;
}

/** Publishes the app directory consumed by `relative()` / `@react-router/fs-routes` at eval time. */
export function setAppDirectory(directory: string): void {
  globalThis.__reactRouterAppDirectory = directory;
}

/** Minimal view of React Router's config object — only the fields the toolkit reads or merges. */
export interface ReactRouterConfig {
  appDirectory?: string;
  presets?: Array<Preset>;
  future?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Preset {
  name?: string;
  reactRouterConfig?: (args: {
    reactRouterUserConfig: ReactRouterConfig;
  }) => Omit<ReactRouterConfig, "presets"> | Promise<Omit<ReactRouterConfig, "presets">>;
}

export function mergeReactRouterConfig(...configs: ReactRouterConfig[]): ReactRouterConfig {
  const reducer = (configA: ReactRouterConfig, configB: ReactRouterConfig): ReactRouterConfig => {
    const mergeRequired = (key: string) => configA[key] !== undefined && configB[key] !== undefined;

    return {
      ...configA,
      ...configB,
      ...(mergeRequired("future") ? { future: { ...configA.future, ...configB.future } } : {}),
      ...(mergeRequired("presets")
        ? { presets: [...(configA.presets ?? []), ...(configB.presets ?? [])] }
        : {}),
    };
  };

  return configs.reduce(reducer, {});
}

export function configRoutesToRouteManifest(
  appDirectory: string,
  routes: RouteConfigEntry[],
): RouteManifest {
  const routeManifest: Record<string, RouteManifestEntry> = {};

  function walk(route: RouteConfigEntry, parentId?: string): void {
    const id = route.id || createRouteId(route.file);
    const manifestItem: RouteManifestEntry = {
      id,
      parentId,
      file: Path.isAbsolute(route.file) ? Path.relative(appDirectory, route.file) : route.file,
      path: route.path,
      index: route.index,
      caseSensitive: route.caseSensitive,
    };

    if (Object.prototype.hasOwnProperty.call(routeManifest, id)) {
      throw new Error(`Unable to define routes with duplicate route id: "${id}"`);
    }
    routeManifest[id] = manifestItem;

    if (route.children) {
      for (const child of route.children) {
        walk(child, id);
      }
    }
  }

  for (const route of routes) {
    walk(route);
  }

  return routeManifest;
}

function createRouteId(file: string): string {
  return Path.normalize(stripFileExtension(file));
}

function stripFileExtension(file: string): string {
  return file.replace(/\.[a-z0-9]+$/i, "");
}
