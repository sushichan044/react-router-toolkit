/**
 * Vendored (with light typing adjustments) from React Router's `@react-router/dev` config
 * internals, which are not part of its public API. React Router is MIT-licensed (Copyright Remix
 * Software Inc., Shopify Inc.).
 *
 * Upstream source: packages/react-router-dev/config/config.ts (react-router v7.15.1) →
 * `ReactRouterConfig` (L127), `ResolvedReactRouterConfig` (L268), `Preset` (L34), the supporting
 * type graph (`FutureConfig`, `BuildEndHook`, `BuildManifest`, `ServerBundlesFunction`,
 * `PrerenderPaths`, …), `mergeReactRouterConfig`, the `findEntry` file-discovery helper (plus its
 * `entryExts` table), and the resolution body of `resolveConfig`.
 * https://github.com/remix-run/react-router/blob/main/packages/react-router-dev/config/config.ts
 *
 * Toolkit-specific changes vs. upstream: - `resolveConfig` is vendored only for its _resolution_
 * logic (presets, defaults, prerender/routeDiscovery normalization, route manifest assembly, future
 * flag resolution). The surrounding vite-node loader pipeline (`createConfigLoader`, the chokidar
 * watcher, `detectPackageManager`, etc.) is intentionally NOT copied — config/routes are loaded
 * through the toolkit's own Vite Module Runner evaluator (see `src/vite.ts`) and the already-loaded
 * data is injected into `resolveConfig`. - Side effects are dropped: `logFutureFlagWarnings`
 * (console output) and the `colors`-based error formatting are removed; instead `resolveConfig`
 * returns a discriminated result so callers can map failures to typed errors. - `cloneDeep`/the
 * defensive deep-freeze of the _input_ user config is not performed (the input is owned by the
 * caller); only the resolved output is deep-frozen to honor its `Readonly` type. -
 * `configRouteToBranchRoute` (a `lodash/pick`-based runtime helper) is dropped; only the
 * `BranchRoute` type it accompanies is kept (needed by `ServerBundlesFunction`).
 */

import { existsSync } from "node:fs";

import * as Path from "pathe";
import type * as Vite from "vite";

import { configRoutesToRouteManifest } from "./routes";
import type { RouteConfigEntry, RouteManifest, RouteManifestEntry } from "./routes";

const excludedConfigPresetKeys = ["presets"] as const satisfies ReadonlyArray<
  keyof ReactRouterConfig
>;

type ExcludedConfigPresetKey = (typeof excludedConfigPresetKeys)[number];

type ConfigPreset = Omit<ReactRouterConfig, ExcludedConfigPresetKey>;

export type Preset = {
  name: string;
  reactRouterConfig?: (args: {
    reactRouterUserConfig: ReactRouterConfig;
  }) => ConfigPreset | Promise<ConfigPreset>;
  reactRouterConfigResolved?: (args: {
    reactRouterConfig: ResolvedReactRouterConfig;
  }) => void | Promise<void>;
};

// Only expose a subset of route properties to the "serverBundles" function
const branchRouteProperties = ["id", "path", "file", "index"] as const satisfies ReadonlyArray<
  keyof RouteManifestEntry
>;
type BranchRoute = Pick<RouteManifestEntry, (typeof branchRouteProperties)[number]>;

export type ServerBundlesFunction = (args: { branch: BranchRoute[] }) => string | Promise<string>;

type BaseBuildManifest = {
  routes: RouteManifest;
};

type DefaultBuildManifest = BaseBuildManifest & {
  serverBundles?: never;
  routeIdToServerBundleId?: never;
};

type ServerBundlesBuildManifest = BaseBuildManifest & {
  serverBundles: {
    [serverBundleId: string]: {
      id: string;
      file: string;
    };
  };
  routeIdToServerBundleId: Record<string, string>;
};

type ServerModuleFormat = "esm" | "cjs";

interface FutureConfig {
  unstable_optimizeDeps: boolean;
  v8_passThroughRequests: boolean;
  v8_trailingSlashAwareDataRequests: boolean;
  /** Prerender with Vite Preview server */
  unstable_previewServerPrerendering?: boolean;
  /** Enable route middleware */
  v8_middleware: boolean;
  /** Automatically split route modules into multiple chunks when possible. */
  v8_splitRouteModules: boolean | "enforce";
  /** Use Vite Environment API */
  v8_viteEnvironmentApi: boolean;
}

export type BuildManifest = DefaultBuildManifest | ServerBundlesBuildManifest;

type BuildEndHook = (args: {
  buildManifest: BuildManifest | undefined;
  reactRouterConfig: ResolvedReactRouterConfig;
  viteConfig: Vite.ResolvedConfig;
}) => void | Promise<void>;

export type PrerenderPaths =
  | boolean
  | Array<string>
  | ((args: { getStaticPaths: () => string[] }) => Array<string> | Promise<Array<string>>);

/** Config to be exported via the default export from `react-router.config.ts`. */
export type ReactRouterConfig = {
  /** The path to the `app` directory, relative to the root directory. Defaults to `"app"`. */
  appDirectory?: string;

  /** The output format of the server build. Defaults to "esm". */
  serverModuleFormat?: ServerModuleFormat;

  /** Enabled future flags */
  future?: [keyof FutureConfig] extends [never]
    ? // Partial<FutureConfig> doesn't work when it's empty so just prevent any keys
      { [key: string]: never }
    : Partial<FutureConfig>;

  /** The React Router app basename. Defaults to `"/"`. */
  basename?: string;
  /** The path to the build directory, relative to the project. Defaults to `"build"`. */
  buildDirectory?: string;
  /** A function that is called after the full React Router build is complete. */
  buildEnd?: BuildEndHook;
  /**
   * An array of URLs to prerender to HTML files at build time. Can also be a function returning an
   * array to dynamically generate URLs.
   *
   * `concurrency` defaults to 1, which means "no concurrency" - fully serial execution. Setting it
   * to a value more than 1 enables concurrent prerendering. Setting it to a value higher than one
   * can increase the speed of the build, but may consume more resources, and send more concurrent
   * requests to the server/CMS.
   */
  prerender?:
    | PrerenderPaths
    | {
        paths: PrerenderPaths;
        concurrency?: number;
      };
  /**
   * An array of React Router plugin config presets to ease integration with other platforms and
   * tools.
   */
  presets?: Array<Preset>;
  /**
   * Control the "Lazy Route Discovery" behavior
   *
   * - `routeDiscovery.mode`: By default, this resolves to `lazy` which will lazily discover routes as
   *   the user navigates around your application. You can set this to `initial` to opt-out of this
   *   behavior and load all routes with the initial HTML document load.
   * - `routeDiscovery.manifestPath`: The path to serve the manifest file from. Only applies to `mode:
   *   "lazy"` and defaults to `/__manifest`.
   */
  routeDiscovery?:
    | {
        mode: "lazy";
        manifestPath?: string;
      }
    | {
        mode: "initial";
      };
  /**
   * The file name of the server build output. This file should end in a `.js` extension and should
   * be deployed to your server. Defaults to `"index.js"`.
   */
  serverBuildFile?: string;
  /**
   * A function for assigning routes to different server bundles. This function should return a
   * server bundle ID which will be used as the bundle's directory name within the server build
   * directory.
   */
  serverBundles?: ServerBundlesFunction;
  /**
   * Enable server-side rendering for your application. Disable to use "SPA Mode", which will
   * request the `/` path at build-time and save it as an `index.html` file with your assets so your
   * application can be deployed as a SPA without server-rendering. Default's to `true`.
   */
  ssr?: boolean;

  /** Enable subresource integrity hashes on asset script tags. Defaults to `false`. */
  subResourceIntegrity?: boolean;

  /**
   * An array of allowed origin hosts for action submissions to UI routes (does not apply to
   * resource routes). Supports micromatch glob patterns (`*` to match one segment, `**` to match
   * multiple).
   */
  allowedActionOrigins?: string[];
};

export type ResolvedReactRouterConfig = Readonly<{
  /** The absolute path to the application source directory. */
  appDirectory: string;
  /** The React Router app basename. Defaults to `"/"`. */
  basename: string;
  /** The absolute path to the build directory. */
  buildDirectory: string;
  /** A function that is called after the full React Router build is complete. */
  buildEnd?: BuildEndHook;
  /** Enabled future flags */
  future: FutureConfig;
  /**
   * An array of URLs to prerender to HTML files at build time. Can also be a function returning an
   * array to dynamically generate URLs.
   */
  prerender: ReactRouterConfig["prerender"];
  /** Control the "Lazy Route Discovery" behavior */
  routeDiscovery: ReactRouterConfig["routeDiscovery"];
  /** An object of all available routes, keyed by route id. */
  routes: RouteManifest;
  /**
   * The file name of the server build output. This file should end in a `.js` extension and should
   * be deployed to your server. Defaults to `"index.js"`.
   */
  serverBuildFile: string;
  /**
   * A function for assigning routes to different server bundles. This function should return a
   * server bundle ID which will be used as the bundle's directory name within the server build
   * directory.
   */
  serverBundles?: ServerBundlesFunction;
  /** The output format of the server build. Defaults to "esm". */
  serverModuleFormat: ServerModuleFormat;
  /**
   * Enable server-side rendering for your application. Disable to use "SPA Mode", which will
   * request the `/` path at build-time and save it as an `index.html` file with your assets so your
   * application can be deployed as a SPA without server-rendering. Default's to `true`.
   */
  ssr: boolean;
  /** Whether to generate subresource integrity hashes for asset script tags. */
  subResourceIntegrity: boolean;
  /**
   * The allowed origins for actions / mutations. Does not apply to routes without a component.
   * micromatch glob patterns are supported.
   */
  allowedActionOrigins: string[] | false;
  /** The resolved array of route config entries exported from `routes.ts` */
  unstable_routeConfig: RouteConfigEntry[];
}>;

export function mergeReactRouterConfig(...configs: ReactRouterConfig[]): ReactRouterConfig {
  const reducer = (configA: ReactRouterConfig, configB: ReactRouterConfig): ReactRouterConfig => {
    const mergeRequired = (key: keyof ReactRouterConfig) =>
      configA[key] !== undefined && configB[key] !== undefined;

    return {
      ...configA,
      ...configB,
      ...(mergeRequired("buildEnd")
        ? {
            buildEnd: async (...args: Parameters<BuildEndHook>) => {
              await Promise.all([configA.buildEnd?.(...args), configB.buildEnd?.(...args)]);
            },
          }
        : {}),
      ...(mergeRequired("future")
        ? {
            future: {
              ...configA.future,
              ...configB.future,
            },
          }
        : {}),
      ...(mergeRequired("presets")
        ? {
            presets: [...(configA.presets ?? []), ...(configB.presets ?? [])],
          }
        : {}),
    };
  };

  return configs.reduce(reducer, {});
}

const entryExts = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".mts"];

export function findEntry(
  dir: string,
  basename: string,
  options?: {
    absolute?: boolean;
    extensions?: string[];
    walkParents?: boolean;
  },
): string | undefined {
  let currentDir = Path.resolve(dir);
  let { root } = Path.parse(currentDir);

  while (true) {
    for (let ext of options?.extensions ?? entryExts) {
      let file = Path.resolve(currentDir, basename + ext);
      if (existsSync(file)) {
        return (options?.absolute ?? false) ? file : Path.relative(dir, file);
      }
    }

    if (!options?.walkParents) {
      return undefined;
    }

    let parentDir = Path.dirname(currentDir);
    // Break out when we've reached the root directory or we're about to get
    // stuck in a loop where `path.dirname` keeps returning "/"
    if (currentDir === root || parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

export type ResolveConfigArgs = {
  /** The absolute path to the project root directory. */
  root: string;
  /** The raw user config (default export of `react-router.config.*`), or `{}` when absent. */
  reactRouterUserConfig: ReactRouterConfig;
  /**
   * Load the validated route config entries (default export of `routes.*`) for the given app
   * directory. Invoked only when {@link ResolveConfigArgs.skipRoutes} is not `true`, and only after
   * `appDirectory` has been resolved from the merged preset/user config — so presets that relocate
   * `appDirectory` are honored. This is the injection point that replaces React Router's vite-node
   * loader with the toolkit's Vite Module Runner evaluator.
   */
  loadRouteConfig: (appDirectory: string) => RouteConfigEntry[] | Promise<RouteConfigEntry[]>;
  /** Skip route manifest assembly; `routes` resolves to an empty manifest. */
  skipRoutes?: boolean;
};

export type ResolveConfigResult =
  | { ok: true; value: ResolvedReactRouterConfig }
  | { ok: false; kind: "config" | "manifest"; message: string };

/**
 * The resolution body of React Router's `resolveConfig`, with the file-loading replaced by injected
 * `reactRouterUserConfig` / `routeConfig`. Returns a discriminated result instead of throwing so
 * the toolkit layer can map `kind` to a typed error.
 */
export async function resolveConfig({
  root,
  reactRouterUserConfig,
  loadRouteConfig,
  skipRoutes,
}: ResolveConfigArgs): Promise<ResolveConfigResult> {
  const err = (kind: "config" | "manifest", message: string): ResolveConfigResult => ({
    ok: false,
    kind,
    message,
  });

  let presets: ReactRouterConfig[] = (
    await Promise.all(
      (reactRouterUserConfig.presets ?? []).map(async (preset) => {
        if (!preset.name) {
          throw new Error("React Router presets must have a `name` property defined.");
        }

        if (!preset.reactRouterConfig) {
          return null;
        }

        // Defensively strip `presets` (excludedConfigPresetKeys) even though the type omits it.
        let { presets: _presets, ...configPreset } = (await preset.reactRouterConfig({
          reactRouterUserConfig,
        })) as ReactRouterConfig;

        return configPreset;
      }),
    )
  ).filter(function isNotNull<T>(value: T | null): value is T {
    return value !== null;
  });

  let defaults = {
    basename: "/",
    buildDirectory: "build",
    serverBuildFile: "index.js",
    serverModuleFormat: "esm",
    ssr: true,
  } as const satisfies Partial<ReactRouterConfig>;

  let userAndPresetConfigs = mergeReactRouterConfig(...presets, reactRouterUserConfig);

  let {
    appDirectory: userAppDirectory,
    basename,
    buildDirectory: userBuildDirectory,
    buildEnd,
    prerender,
    routeDiscovery: userRouteDiscovery,
    serverBuildFile,
    serverBundles,
    serverModuleFormat,
    ssr,
  } = {
    ...defaults, // Default values should be completely overridden by user/preset config, not merged
    ...userAndPresetConfigs,
  };

  if (!ssr && serverBundles) {
    serverBundles = undefined;
  }

  if (prerender) {
    let isValidPrerenderPathsConfig = (p: unknown) =>
      typeof p === "boolean" || typeof p === "function" || Array.isArray(p);

    let isValidPrerenderConfig =
      isValidPrerenderPathsConfig(prerender) ||
      (typeof prerender === "object" &&
        "paths" in prerender &&
        isValidPrerenderPathsConfig(prerender.paths));

    if (!isValidPrerenderConfig) {
      return err(
        "config",
        "The `prerender`/`prerender.paths` config must be a boolean, an array " +
          "of string paths, or a function returning a boolean or array of string paths.",
      );
    }

    if (typeof prerender === "object" && "unstable_concurrency" in prerender) {
      return err(
        "config",
        "The `prerender.unstable_concurrency` config field has been stabilized as `prerender.concurrency`",
      );
    }

    let isValidConcurrencyConfig =
      typeof prerender != "object" ||
      !("concurrency" in prerender) ||
      (typeof prerender.concurrency === "number" &&
        Number.isInteger(prerender.concurrency) &&
        prerender.concurrency > 0);

    if (!isValidConcurrencyConfig) {
      return err(
        "config",
        "The `prerender.concurrency` config must be a positive integer if specified.",
      );
    }
  }

  let routeDiscovery: ResolvedReactRouterConfig["routeDiscovery"];
  if (userRouteDiscovery == null) {
    if (ssr) {
      routeDiscovery = {
        mode: "lazy",
        manifestPath: "/__manifest",
      };
    } else {
      routeDiscovery = { mode: "initial" };
    }
  } else if (userRouteDiscovery.mode === "initial") {
    routeDiscovery = userRouteDiscovery;
  } else if (userRouteDiscovery.mode === "lazy") {
    if (!ssr) {
      return err(
        "config",
        'The `routeDiscovery.mode` config cannot be set to "lazy" when setting `ssr:false`',
      );
    }

    let { manifestPath } = userRouteDiscovery;
    if (manifestPath != null && !manifestPath.startsWith("/")) {
      return err(
        "config",
        "The `routeDiscovery.manifestPath` config must be a root-relative " +
          'pathname beginning with a slash (i.e., "/__manifest")',
      );
    }

    routeDiscovery = userRouteDiscovery;
  }

  let appDirectory = Path.resolve(root, userAppDirectory || "app");
  let buildDirectory = Path.resolve(root, userBuildDirectory);

  let rootRouteFile = findEntry(appDirectory, "root", { absolute: true });
  if (!rootRouteFile) {
    let rootRouteDisplayPath = Path.relative(root, Path.join(appDirectory, "root.tsx"));
    return err(
      "manifest",
      `Could not find a root route module in the app directory as "${rootRouteDisplayPath}"`,
    );
  }

  let routes: RouteManifest;
  let resolvedRouteConfig: RouteConfigEntry[] = [];

  if (skipRoutes) {
    routes = {};
  } else {
    let routeConfig = await loadRouteConfig(appDirectory);

    // Nest the route config under the resolved root route
    resolvedRouteConfig = [
      {
        id: "root",
        path: "",
        file: Path.relative(appDirectory, rootRouteFile),
        children: routeConfig,
      },
    ];

    try {
      routes = configRoutesToRouteManifest(appDirectory, resolvedRouteConfig);
    } catch (error) {
      return err("manifest", error instanceof Error ? error.message : String(error));
    }
  }

  // Check for renamed flags and provide helpful error messages
  let futureConfig = userAndPresetConfigs.future;
  if (futureConfig) {
    if ("unstable_splitRouteModules" in futureConfig) {
      return err(
        "config",
        "The `future.unstable_splitRouteModules` flag has been stabilized as `future.v8_splitRouteModules`",
      );
    }
    if ("unstable_viteEnvironmentApi" in futureConfig) {
      return err(
        "config",
        "The `future.unstable_viteEnvironmentApi` flag has been stabilized as `future.v8_viteEnvironmentApi`",
      );
    }
    if ("unstable_passThroughRequests" in futureConfig) {
      return err(
        "config",
        "The `future.unstable_passThroughRequests` flag has been stabilized as `future.v8_passThroughRequests`",
      );
    }
    if ("unstable_trailingSlashAwareDataRequests" in futureConfig) {
      return err(
        "config",
        "The `future.unstable_trailingSlashAwareDataRequests` flag has been stabilized as `future.v8_trailingSlashAwareDataRequests`",
      );
    }
    if ("unstable_subResourceIntegrity" in futureConfig) {
      return err(
        "config",
        "The `future.unstable_subResourceIntegrity` flag has been stabilized and moved to a top-level `config.subResourceIntegrity` field",
      );
    }
  }

  let future: FutureConfig = {
    unstable_optimizeDeps: userAndPresetConfigs.future?.unstable_optimizeDeps ?? false,
    v8_passThroughRequests: userAndPresetConfigs.future?.v8_passThroughRequests ?? false,
    v8_trailingSlashAwareDataRequests:
      userAndPresetConfigs.future?.v8_trailingSlashAwareDataRequests ?? false,
    unstable_previewServerPrerendering:
      userAndPresetConfigs.future?.unstable_previewServerPrerendering ?? false,
    v8_middleware: userAndPresetConfigs.future?.v8_middleware ?? false,
    v8_splitRouteModules: userAndPresetConfigs.future?.v8_splitRouteModules ?? false,
    v8_viteEnvironmentApi:
      (userAndPresetConfigs.future?.v8_viteEnvironmentApi ||
        userAndPresetConfigs.future?.unstable_previewServerPrerendering) ??
      false,
  };

  let allowedActionOrigins = userAndPresetConfigs.allowedActionOrigins ?? false;
  let subResourceIntegrity = userAndPresetConfigs.subResourceIntegrity ?? false;

  let reactRouterConfig: ResolvedReactRouterConfig = deepFreeze({
    appDirectory,
    basename,
    buildDirectory,
    buildEnd,
    future,
    prerender,
    routes,
    routeDiscovery,
    serverBuildFile,
    serverBundles,
    serverModuleFormat,
    ssr,
    subResourceIntegrity,
    allowedActionOrigins,
    unstable_routeConfig: resolvedRouteConfig,
  } satisfies ResolvedReactRouterConfig);

  for (let preset of reactRouterUserConfig.presets ?? []) {
    await preset.reactRouterConfigResolved?.({ reactRouterConfig });
  }

  return { ok: true, value: reactRouterConfig };
}

// Standard recursive freeze (MDN). Used only on the resolved output to honor its `Readonly` type.
function deepFreeze<T>(value: T): T {
  Object.freeze(value);
  let isFunction = typeof value === "function";
  for (let key of Object.getOwnPropertyNames(value)) {
    let prop = (value as Record<string, unknown>)[key];
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      (isFunction ? key !== "caller" && key !== "callee" && key !== "arguments" : true) &&
      prop !== null &&
      (typeof prop === "object" || typeof prop === "function") &&
      !Object.isFrozen(prop)
    ) {
      deepFreeze(prop);
    }
  }
  return value;
}
