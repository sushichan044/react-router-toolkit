import * as Path from "pathe";

import { RouteManifestError } from "../errors";
import { findEntry } from "../vendor/react-router/config/config";
import { configRoutesToRouteManifest } from "../vendor/react-router/config/routes";
import type { RouteConfigEntry, RouteManifest } from "../vendor/react-router/config/routes";

const ROOT_BASENAME = "root";

/**
 * Assemble a {@link RouteManifest} from the raw `routes.ts` config, mirroring how React Router nests
 * every route under the synthesized `root` route before flattening into a manifest keyed by id.
 *
 * Requires `app/root.{tsx,...}` to exist in {@link appDirectory}; throws {@link RouteManifestError}
 * if it is missing or if assembling the tree produces a duplicate route id.
 */
export function buildRouteManifest(
  appDirectory: string,
  routeConfig: RouteConfigEntry[],
): RouteManifest {
  const rootRouteFile = findEntry(appDirectory, ROOT_BASENAME, { absolute: true });
  if (rootRouteFile === undefined) {
    throw new RouteManifestError(
      `Could not find a root route module ("${ROOT_BASENAME}.tsx") in "${appDirectory}".`,
    );
  }

  const nested: RouteConfigEntry[] = [
    {
      id: "root",
      path: "",
      file: Path.relative(appDirectory, rootRouteFile),
      children: routeConfig,
    },
  ];

  try {
    return configRoutesToRouteManifest(appDirectory, nested);
  } catch (error) {
    throw new RouteManifestError(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
}
