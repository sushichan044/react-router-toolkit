import { resolve as resolvePath } from "node:path";

import { getTsconfig } from "get-tsconfig";
import { dirname, join } from "pathe";
import {
  analyzeRouteModules,
  findOrphanRouteFiles,
  listPublicAssets,
  resolveReactRouterConfig,
} from "react-router-toolkit";
import * as v from "valibot";

import type { ReactRouterToolkitSettings } from "./settings";
import { SETTINGS_KEY, settingsSchema } from "./settings";

interface ReactRouterToolkitSettingsOptions {
  /** Vite root: the directory containing `vite.config.*` and the app directory. */
  root: string;
  /**
   * Override Vite's dependency-optimization cache directory for the underlying evaluator. Pass a
   * unique directory to safely resolve multiple projects concurrently.
   */
  cacheDir?: string;
}

/**
 * Resolve a React Router project's config and return it shaped as linter `settings`, ready to
 * spread into `oxlint.config.ts`:
 *
 * ```ts
 * import { defineConfig } from "oxlint";
 * import { reactRouterToolkitSettings } from "@react-router-toolkit/oxlint-plugin/setup";
 *
 * export default defineConfig({
 *   jsPlugins: ["@react-router-toolkit/oxlint-plugin"],
 *   settings: {
 *     ...(await reactRouterToolkitSettings({ root: import.meta.dirname })),
 *   },
 * });
 * ```
 */
export async function reactRouterToolkitSettings(
  options: ReactRouterToolkitSettingsOptions,
): Promise<Record<typeof SETTINGS_KEY, ReactRouterToolkitSettings>> {
  const resolved = await resolveReactRouterConfig(options.root, { cacheDir: options.cacheDir });
  const jsonSafe: unknown = JSON.parse(JSON.stringify(resolved));
  const absoluteRoot = resolvePath(options.root);
  // Vite's default public directory is `<root>/public`. listPublicAssets returns an empty array
  // when the directory is absent, so no special-casing is needed.
  const publicAssets = await listPublicAssets(`${absoluteRoot}/public`);
  return {
    [SETTINGS_KEY]: v.parse(settingsSchema, {
      // Absolute so the rules can render route paths relative to it regardless of how `root` was
      // passed.
      root: absoluteRoot,
      resolvedSettings: jsonSafe,
      // Source-derived facts (file existence, outlet context, exports), gathered once here so lint
      // rules never touch the filesystem.
      routeModules: await analyzeRouteModules(resolved),
      // Static assets in the public directory are served at their path verbatim; links to them
      // are not React Router routes and must not be flagged.
      publicAssets,
      // Route module files that exist on disk but are not registered in the route manifest.
      // Computed once here so the lint rule never touches the filesystem.
      orphanRouteFiles: await findOrphanRouteFiles(resolved.routes, resolved.appDirectory),
      // Import alias mappings derived from the project's tsconfig paths, resolved to absolute
      // paths once here so lint rules can resolve aliased imports without filesystem access.
      importAliases: resolveImportAliases(absoluteRoot),
    }),
  };
}

function resolveImportAliases(root: string): Array<{ alias: string; targets: string[] }> {
  const result = getTsconfig(root);
  if (result === null) {
    return [];
  }

  const { config, path: tsconfigPath } = result;
  const tsconfigDir = dirname(tsconfigPath);
  const baseUrl = config.compilerOptions?.baseUrl;
  const paths = config.compilerOptions?.paths;

  if (paths === undefined || paths === null) {
    return [];
  }

  // Resolve the base directory for path mappings: baseUrl relative to tsconfig location, or the
  // tsconfig's directory when baseUrl is absent.
  const baseDir = baseUrl !== undefined ? join(tsconfigDir, baseUrl) : tsconfigDir;

  const aliases: Array<{ alias: string; targets: string[] }> = [];

  for (const [pattern, rawTargets] of Object.entries(paths)) {
    if (!Array.isArray(rawTargets)) {
      continue;
    }

    // Normalize wildcard patterns: `~/*` becomes alias prefix `~/` by stripping the trailing `*`.
    // Non-wildcard patterns are used as-is.
    const alias = pattern.endsWith("/*") ? pattern.slice(0, -1) : pattern;
    const isWildcard = pattern.endsWith("/*");

    const targets = rawTargets
      .map((t: string) => {
        // Strip the trailing `/*` from target, then resolve to absolute path.
        const normalized = isWildcard && t.endsWith("/*") ? t.slice(0, -1) : t;
        const abs = join(baseDir, normalized);
        // Append slash so membership checks can use startsWith reliably.
        return isWildcard ? `${abs}/` : abs;
      })
      .filter((t: string) => t.length > 0);

    if (targets.length > 0) {
      aliases.push({ alias, targets });
    }
  }

  return aliases;
}

export { SETTINGS_KEY } from "./settings";
export type { ReactRouterToolkitSettings } from "./settings";
