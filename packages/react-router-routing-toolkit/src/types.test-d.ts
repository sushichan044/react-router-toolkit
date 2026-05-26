import { describe, expectTypeOf, it } from "vite-plus/test";

import { buildRouteTree, evaluateRoutesFile, loadRouteTree } from ".";
import type {
  BranchRouteNode,
  IndexRouteNode,
  LayoutRouteNode,
  LeafRouteNode,
  LoadRoutesOptions,
  PathfulRouteNode,
  PathlessRouteNode,
  RouteConfigEntry,
  RouteIndex,
  RouteNode,
  RouteTree,
  TerminalRouteNode,
  UrlMatch,
  WrapperRouteNode,
} from "./types";
import {
  RouteEvaluationError,
  RouteManifestError,
  RouteToolkitError,
  RouteValidationError,
} from "./types";
import {
  buildRouteIndex,
  findByFile,
  getRenderChain,
  getRouteById,
  isPathful,
  isPathless,
  isTerminal,
  isWrapper,
  listRoutes,
  matchUrl,
} from "./utils";

describe("entry-point types", () => {
  it("loadRouteTree returns Promise<RouteTree>", () => {
    expectTypeOf(loadRouteTree).returns.toEqualTypeOf<Promise<RouteTree>>();
  });

  it("loadRouteTree accepts an optional LoadRoutesOptions", () => {
    expectTypeOf(loadRouteTree).parameter(0).toEqualTypeOf<LoadRoutesOptions | undefined>();
  });

  it("evaluateRoutesFile returns Promise<readonly RouteConfigEntry[]>", () => {
    expectTypeOf(evaluateRoutesFile).returns.toEqualTypeOf<Promise<readonly RouteConfigEntry[]>>();
  });

  it("buildRouteTree returns a RouteTree from a readonly RouteConfigEntry[]", () => {
    expectTypeOf(buildRouteTree).parameter(0).toEqualTypeOf<readonly RouteConfigEntry[]>();
    expectTypeOf(buildRouteTree).returns.toEqualTypeOf<RouteTree>();
  });

  it("buildRouteIndex returns RouteIndex", () => {
    expectTypeOf(buildRouteIndex).returns.toEqualTypeOf<RouteIndex>();
  });
});

describe("RouteNode discriminated union", () => {
  it("RouteTree is a LayoutRouteNode (and therefore a RouteNode)", () => {
    expectTypeOf<RouteTree>().toExtend<LayoutRouteNode>();
    expectTypeOf<RouteTree>().toExtend<RouteNode>();
  });

  it("RouteTree carries root-only invariants on id, parentId, and fullPath", () => {
    expectTypeOf<RouteTree["id"]>().toEqualTypeOf<"root">();
    expectTypeOf<RouteTree["parentId"]>().toEqualTypeOf<undefined>();
    expectTypeOf<RouteTree["fullPath"]>().toEqualTypeOf<"/">();
  });

  it("a generic LayoutRouteNode is NOT assignable to RouteTree", () => {
    expectTypeOf<LayoutRouteNode>().not.toExtend<RouteTree>();
  });

  it("RouteNode is the union of the four kinds", () => {
    expectTypeOf<RouteNode>().toEqualTypeOf<
      IndexRouteNode | LayoutRouteNode | LeafRouteNode | BranchRouteNode
    >();
  });

  it("kind narrows the union to a single variant", () => {
    const node = {} as RouteNode;
    if (node.kind === "index") expectTypeOf(node).toEqualTypeOf<IndexRouteNode>();
    if (node.kind === "layout") expectTypeOf(node).toEqualTypeOf<LayoutRouteNode>();
    if (node.kind === "leaf") expectTypeOf(node).toEqualTypeOf<LeafRouteNode>();
    if (node.kind === "branch") expectTypeOf(node).toEqualTypeOf<BranchRouteNode>();
  });

  it("IndexRouteNode has path: string | undefined", () => {
    expectTypeOf<IndexRouteNode["path"]>().toEqualTypeOf<string | undefined>();
  });

  it("LeafRouteNode has path: string (never undefined)", () => {
    expectTypeOf<LeafRouteNode["path"]>().toEqualTypeOf<string>();
  });

  it("BranchRouteNode has path: string (never undefined)", () => {
    expectTypeOf<BranchRouteNode["path"]>().toEqualTypeOf<string>();
  });

  it("LayoutRouteNode and BranchRouteNode carry children: readonly RouteNode[]", () => {
    expectTypeOf<LayoutRouteNode["children"]>().toEqualTypeOf<readonly RouteNode[]>();
    expectTypeOf<BranchRouteNode["children"]>().toEqualTypeOf<readonly RouteNode[]>();
  });
});

describe("helper unions", () => {
  it("TerminalRouteNode equals IndexRouteNode | LeafRouteNode", () => {
    expectTypeOf<TerminalRouteNode>().toEqualTypeOf<IndexRouteNode | LeafRouteNode>();
  });

  it("WrapperRouteNode equals LayoutRouteNode | BranchRouteNode", () => {
    expectTypeOf<WrapperRouteNode>().toEqualTypeOf<LayoutRouteNode | BranchRouteNode>();
  });

  it("PathfulRouteNode covers leaf, branch, and pathful index", () => {
    expectTypeOf<PathfulRouteNode>().toEqualTypeOf<
      LeafRouteNode | BranchRouteNode | (IndexRouteNode & { readonly path: string })
    >();
  });

  it("PathlessRouteNode covers layout and pathless index", () => {
    expectTypeOf<PathlessRouteNode>().toEqualTypeOf<
      LayoutRouteNode | (IndexRouteNode & { readonly path: undefined })
    >();
  });
});

describe("type guards", () => {
  it("isTerminal narrows to TerminalRouteNode", () => {
    const node = {} as RouteNode;
    if (isTerminal(node)) expectTypeOf(node).toEqualTypeOf<TerminalRouteNode>();
  });

  it("isWrapper narrows to WrapperRouteNode", () => {
    const node = {} as RouteNode;
    if (isWrapper(node)) expectTypeOf(node).toEqualTypeOf<WrapperRouteNode>();
  });

  it("isPathful narrows to PathfulRouteNode", () => {
    const node = {} as RouteNode;
    if (isPathful(node)) expectTypeOf(node).toEqualTypeOf<PathfulRouteNode>();
  });

  it("isPathless narrows to PathlessRouteNode", () => {
    const node = {} as RouteNode;
    if (isPathless(node)) expectTypeOf(node).toEqualTypeOf<PathlessRouteNode>();
  });
});

describe("collection / utility return types", () => {
  it("RouteIndex is a ReadonlyMap<string, RouteNode>", () => {
    expectTypeOf<RouteIndex>().toEqualTypeOf<ReadonlyMap<string, RouteNode>>();
  });

  it("listRoutes returns readonly TerminalRouteNode[]", () => {
    expectTypeOf(listRoutes).returns.toEqualTypeOf<readonly TerminalRouteNode[]>();
  });

  it("matchUrl returns UrlMatch | null", () => {
    expectTypeOf(matchUrl).returns.toEqualTypeOf<UrlMatch | null>();
  });

  it("UrlMatch shape", () => {
    expectTypeOf<UrlMatch["terminal"]>().toEqualTypeOf<TerminalRouteNode>();
    expectTypeOf<UrlMatch["renderChain"]>().toEqualTypeOf<readonly RouteNode[]>();
  });

  it("getRenderChain returns readonly RouteNode[]", () => {
    expectTypeOf(getRenderChain).returns.toEqualTypeOf<readonly RouteNode[]>();
  });

  it("findByFile returns RouteNode | undefined", () => {
    expectTypeOf(findByFile).returns.toEqualTypeOf<RouteNode | undefined>();
  });

  it("getRouteById returns RouteNode", () => {
    expectTypeOf(getRouteById).returns.toEqualTypeOf<RouteNode>();
  });
});

describe("error types", () => {
  it("error subclasses narrow their kind property to a literal", () => {
    expectTypeOf<RouteEvaluationError["kind"]>().toEqualTypeOf<"evaluation">();
    expectTypeOf<RouteManifestError["kind"]>().toEqualTypeOf<"manifest">();
    expectTypeOf<RouteValidationError["kind"]>().toEqualTypeOf<"validation">();
  });

  it("error subclasses are assignable to RouteToolkitError", () => {
    expectTypeOf<RouteEvaluationError>().toExtend<RouteToolkitError>();
    expectTypeOf<RouteManifestError>().toExtend<RouteToolkitError>();
    expectTypeOf<RouteValidationError>().toExtend<RouteToolkitError>();
  });
});
