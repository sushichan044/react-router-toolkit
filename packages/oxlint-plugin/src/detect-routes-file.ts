import { basename, dirname } from "node:path";

/**
 * Recognized basenames for a React Router routes config file, mirroring the extensions React Router
 * itself resolves for `routes.*`.
 */
const ROUTES_FILE_BASENAMES: ReadonlySet<string> = new Set([
  "routes.js",
  "routes.jsx",
  "routes.ts",
  "routes.tsx",
  "routes.mjs",
  "routes.mts",
]);

/**
 * Imports that indicate the file declares a React Router route config rather than coincidentally
 * being named `routes.*`.
 */
const ROUTE_CONFIG_MARKERS = ["@react-router/dev/routes", "@react-router/fs-routes"];

/**
 * Whether the linted file is the routes config of the resolved project: it sits directly in the
 * resolved `appDirectory`, is named `routes.*`, and imports a React Router route config helper.
 */
export function isRoutesConfigFile(
  filename: string,
  sourceText: string,
  appDirectory: string,
): boolean {
  if (dirname(filename) !== appDirectory) {
    return false;
  }
  if (!ROUTES_FILE_BASENAMES.has(basename(filename))) {
    return false;
  }
  return ROUTE_CONFIG_MARKERS.some((marker) => sourceText.includes(marker));
}
