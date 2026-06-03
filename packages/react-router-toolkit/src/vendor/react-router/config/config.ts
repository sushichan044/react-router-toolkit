/**
 * Vendored (with light typing adjustments) from React Router's `@react-router/dev` config
 * internals, which are not part of its public API. React Router is MIT-licensed (Copyright Remix
 * Software Inc., Shopify Inc.).
 *
 * Upstream source: packages/react-router-dev/config/config.ts (react-router v7.15.1) →
 * `ReactRouterConfig` (L127), `ResolvedReactRouterConfig` (L268), `Preset` (L34), the supporting
 * type graph (`FutureConfig`, `BuildEndHook`, `BuildManifest`, `ServerBundlesFunction`,
 * `PrerenderPaths`, …) and `mergeReactRouterConfig`.
 * https://github.com/remix-run/react-router/blob/main/packages/react-router-dev/config/config.ts
 *
 * Toolkit-specific changes vs. upstream: - The vite-node based loader pipeline
 * (`resolveConfig`/`createConfigLoader`, the chokidar watcher, `detectPackageManager`, etc.) is
 * intentionally NOT copied — the toolkit loads config/routes through its own Vite Module Runner
 * evaluator (see `src/vite.ts`). Only the config types and `mergeReactRouterConfig` are vendored. -
 * `configRouteToBranchRoute` (a `lodash/pick`-based runtime helper) is dropped; only the
 * `BranchRoute` type it accompanies is kept (needed by `ServerBundlesFunction`).
 */

import type * as Vite from "vite";

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
