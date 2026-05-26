import { posix as posixPath } from "node:path";

import type { RouteObject } from "react-router";
import { matchRoutes } from "react-router";

import type {
  PathfulRouteNode,
  PathlessRouteNode,
  RouteIndex,
  RouteNode,
  RouteTree,
  TerminalRouteNode,
  UrlMatch,
  WrapperRouteNode,
} from "./types";
import { RouteManifestError } from "./types";

/** Walk a node depth-first, yielding each descendant in pre-order (parent before children). */
function* walk(node: RouteNode): Generator<RouteNode> {
  yield node;
  if (node.kind === "layout" || node.kind === "branch") {
    for (const child of node.children) {
      yield* walk(child);
    }
  }
}

/**
 * Build an id → {@link RouteNode} lookup from a {@link RouteTree}.
 *
 * Insertion order is depth-first (the synthesized root appears first, then each parent before its
 * children) — `[...index.keys()]` reflects the tree's pre-order traversal.
 */
export function buildRouteIndex(tree: RouteTree): RouteIndex {
  const map = new Map<string, RouteNode>();
  for (const node of walk(tree)) {
    map.set(node.id, node);
  }
  return map;
}

/**
 * Look up a node by id. Throws when the id is missing — convenient when the caller has already
 * established (via another path) that the id is valid and a miss indicates a bug.
 *
 * @throws {RouteManifestError}
 */
export function getRouteById(index: RouteIndex, id: string): RouteNode {
  const node = index.get(id);
  if (node === undefined) {
    throw new RouteManifestError(`Route id "${id}" is not present in the index.`);
  }
  return node;
}

/**
 * Reverse-lookup a node by its `file` field. Paths are compared after POSIX normalisation. Returns
 * `undefined` when no node matches.
 */
export function findByFile(index: RouteIndex, filePath: string): RouteNode | undefined {
  const target = posixPath.normalize(filePath);
  for (const node of index.values()) {
    if (posixPath.normalize(node.file) === target) {
      return node;
    }
  }
  return undefined;
}

/**
 * Walk parent pointers from a given route id back to the synthesized root and return the chain in
 * root → leaf order (the requested node is the last element, the root layout is the first).
 *
 * This chain is the "render stack" — the layers React Router renders when this route matches, in
 * outer-to-inner order.
 *
 * @throws {RouteManifestError} When `id` is not present in the index.
 */
export function getRenderChain(index: RouteIndex, id: string): readonly RouteNode[] {
  if (!index.has(id)) {
    throw new RouteManifestError(`Route id "${id}" is not present in the index.`);
  }
  const chain: RouteNode[] = [];
  let current: RouteNode | undefined = index.get(id);
  while (current !== undefined) {
    chain.unshift(current);
    current = current.parentId !== undefined ? index.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * Enumerate every terminal node ({@link TerminalRouteNode}) in the tree, sorted by `fullPath`.
 *
 * "Terminal" here means matchable as the leaf of a URL match — `index` and `leaf` nodes. Wrappers
 * (`layout`, `branch`) are excluded.
 */
export function listRoutes(tree: RouteTree): readonly TerminalRouteNode[] {
  const results: TerminalRouteNode[] = [];
  for (const node of walk(tree)) {
    if (isTerminal(node)) {
      results.push(node);
    }
  }
  results.sort((a, b) => {
    if (a.fullPath < b.fullPath) return -1;
    if (a.fullPath > b.fullPath) return 1;
    return 0;
  });
  return results;
}

/** Convert a {@link RouteNode} to a `RouteObject` understood by React Router's `matchRoutes`. */
function toRouteObject(node: RouteNode): RouteObject {
  if (node.kind === "index") {
    // `prefix()` can give an index its own path; React Router's RouteObject keeps the two pieces
    // separate (`index: true` plus `path`), so we mirror that.
    return node.path !== undefined
      ? { id: node.id, index: true, path: node.path, caseSensitive: node.caseSensitive }
      : { id: node.id, index: true, caseSensitive: node.caseSensitive };
  }
  if (node.kind === "leaf") {
    return { id: node.id, path: node.path, caseSensitive: node.caseSensitive };
  }
  if (node.kind === "branch") {
    return {
      id: node.id,
      path: node.path,
      caseSensitive: node.caseSensitive,
      children: node.children.map(toRouteObject),
    };
  }
  return {
    id: node.id,
    caseSensitive: node.caseSensitive,
    children: node.children.map(toRouteObject),
  };
}

/**
 * Match a URL against the tree using React Router's own `matchRoutes`. The returned {@link UrlMatch}
 * carries the terminal node, the full root → terminal render chain, and the extracted URL
 * parameters.
 */
export function matchUrl(tree: RouteTree, url: string): UrlMatch | null {
  const matches = matchRoutes([toRouteObject(tree)], url);
  if (matches === null || matches.length === 0) {
    return null;
  }
  const terminalMatch = matches[matches.length - 1];
  if (terminalMatch === undefined) {
    return null;
  }
  const index = buildRouteIndex(tree);
  const terminalId = terminalMatch.route.id;
  if (terminalId === undefined) {
    return null;
  }
  const terminalNode = index.get(terminalId);
  if (terminalNode === undefined || !isTerminal(terminalNode)) {
    return null;
  }
  return {
    terminal: terminalNode,
    renderChain: getRenderChain(index, terminalId),
    params: terminalMatch.params,
  };
}

export function isTerminal(node: RouteNode): node is TerminalRouteNode {
  return node.kind === "index" || node.kind === "leaf";
}

export function isWrapper(node: RouteNode): node is WrapperRouteNode {
  return node.kind === "layout" || node.kind === "branch";
}

export function isPathful(node: RouteNode): node is PathfulRouteNode {
  if (node.kind === "leaf" || node.kind === "branch") {
    return true;
  }
  if (node.kind === "index") {
    return node.path !== undefined;
  }
  return false;
}

export function isPathless(node: RouteNode): node is PathlessRouteNode {
  if (node.kind === "layout") {
    return true;
  }
  if (node.kind === "index") {
    return node.path === undefined;
  }
  return false;
}
