import { resolve as resolvePath } from "node:path";

import type { ESTree } from "@oxlint/plugins";

/**
 * Index of the route module path argument for each route helper.
 *
 * - `index("home.tsx")` / `layout("shell.tsx", [...])` → arg 0
 * - `route("about", "about.tsx")` → arg 1
 *
 * `prefix(...)` carries no file argument, so it is intentionally absent.
 */
const FILE_ARG_INDEX: Readonly<Record<string, number>> = {
  index: 0,
  layout: 0,
  route: 1,
};

export interface FileLiteral {
  readonly value: string;
  readonly node: ESTree.StringLiteral;
}

/**
 * Extract the route module path string literal from a `route` / `index` / `layout` call. Returns
 * `null` when the call is unrelated or the path argument is not a plain string literal (e.g. a
 * template literal or an imported constant), in which case there is no precise location to report.
 */
export function extractFileLiteral(node: ESTree.CallExpression): FileLiteral | null {
  const { callee } = node;
  if (callee.type !== "Identifier") {
    return null;
  }

  const argIndex = FILE_ARG_INDEX[callee.name];
  if (argIndex === undefined) {
    return null;
  }

  const arg = node.arguments[argIndex];
  if (arg?.type !== "Literal" || typeof arg.value !== "string") {
    return null;
  }

  return { value: arg.value, node: arg };
}

/**
 * Map the absolute resolved path of each literal to its AST node, so a missing route file (known
 * from evaluation) can be reported on the exact source literal that declared it.
 */
export function buildLiteralLocationMap(
  literals: readonly FileLiteral[],
  appDirectory: string,
): ReadonlyMap<string, ESTree.StringLiteral> {
  const map = new Map<string, ESTree.StringLiteral>();
  for (const literal of literals) {
    const absolute = resolvePath(appDirectory, literal.value);
    if (!map.has(absolute)) {
      map.set(absolute, literal.node);
    }
  }
  return map;
}
