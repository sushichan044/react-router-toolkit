import { basename, dirname, resolve as resolvePath } from "node:path";

/**
 * `react-router-routing-toolkit`'s evaluator resolves `<root>/app/routes.ts`, so detection is
 * limited to a file literally named `routes.ts`.
 */
const ROUTES_FILE_NAME = "routes.ts";

/**
 * Imports that indicate the file declares a React Router route config rather than coincidentally
 * being named `routes.ts`.
 */
const ROUTE_CONFIG_MARKERS = ["@react-router/dev/routes", "@react-router/fs-routes"];

export interface RoutesFileOption {
  /**
   * Vite root (directory containing `vite.config.*` and `app/`). Defaults to the parent of
   * `appDirectory`.
   */
  readonly root?: string;
  /** Directory route module paths resolve against. Defaults to the directory holding `routes.ts`. */
  readonly appDirectory?: string;
}

export interface RoutesContext {
  readonly root: string;
  readonly appDirectory: string;
}

export function detectRoutesContext(
  filename: string,
  sourceText: string,
  option: RoutesFileOption | undefined,
): RoutesContext | null {
  if (basename(filename) !== ROUTES_FILE_NAME) {
    return null;
  }
  if (!ROUTE_CONFIG_MARKERS.some((marker) => sourceText.includes(marker))) {
    return null;
  }

  const appDirectory = option?.appDirectory ? resolvePath(option.appDirectory) : dirname(filename);
  const root = option?.root ? resolvePath(option.root) : dirname(appDirectory);

  return { appDirectory, root };
}
