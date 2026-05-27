import { describe, expectTypeOf, it } from "vite-plus/test";

import { buildRouteTree, loadRouteTree, resolveRouteManifest } from ".";
import {
  RouteEvaluationError,
  RouteManifestError,
  RouteToolkitError,
  RouteValidationError,
} from "./errors";
import type {
  LoadRoutesOptions,
  ResolvedRouteManifest,
  RouteIndex,
  RouteManifest,
  RouteNode,
  RouteTree,
  UrlMatch,
} from "./types";
import { buildRouteIndex, listRoutes, matchUrl } from "./utils";

describe("entry-point types", () => {
  it("loadRouteTree returns Promise<RouteTree>", () => {
    expectTypeOf(loadRouteTree).returns.toEqualTypeOf<Promise<RouteTree>>();
  });

  it("loadRouteTree accepts an optional LoadRoutesOptions", () => {
    expectTypeOf(loadRouteTree).parameter(0).toEqualTypeOf<LoadRoutesOptions | undefined>();
  });

  it("resolveRouteManifest returns Promise<ResolvedRouteManifest>", () => {
    expectTypeOf(resolveRouteManifest).returns.toEqualTypeOf<Promise<ResolvedRouteManifest>>();
  });

  it("buildRouteTree returns a RouteTree from a RouteManifest", () => {
    expectTypeOf(buildRouteTree).parameter(0).toEqualTypeOf<RouteManifest>();
    expectTypeOf(buildRouteTree).returns.toEqualTypeOf<RouteTree>();
  });

  it("buildRouteIndex returns RouteIndex", () => {
    expectTypeOf(buildRouteIndex).returns.toEqualTypeOf<RouteIndex>();
  });
});

describe("RouteNode discriminated union", () => {
  it("RouteTree extends RouteNode", () => {
    expectTypeOf<RouteTree>().toExtend<RouteNode>();
  });

  it("RouteTree carries root-only invariants on id, parentId, and fullPath", () => {
    expectTypeOf<RouteTree["id"]>().toEqualTypeOf<"root">();
    expectTypeOf<RouteTree["parentId"]>().toEqualTypeOf<undefined>();
    expectTypeOf<RouteTree["fullPath"]>().toEqualTypeOf<"/">();
  });

  it("kind narrows RouteNode to a single variant", () => {
    const node = {} as RouteNode;
    if (node.kind === "index") expectTypeOf(node.path).toEqualTypeOf<string | undefined>();
    if (node.kind === "leaf") expectTypeOf(node.path).toEqualTypeOf<string>();
    if (node.kind === "branch") expectTypeOf(node.path).toEqualTypeOf<string>();
    if (node.kind === "layout" || node.kind === "branch") {
      expectTypeOf(node.children).toEqualTypeOf<readonly RouteNode[]>();
    }
  });
});

describe("collection / utility return types", () => {
  it("RouteIndex is a ReadonlyMap<string, RouteNode>", () => {
    expectTypeOf<RouteIndex>().toEqualTypeOf<ReadonlyMap<string, RouteNode>>();
  });

  it("listRoutes returns readonly RouteNode[] (terminal nodes)", () => {
    expectTypeOf(listRoutes).returns.toExtend<readonly RouteNode[]>();
  });

  it("matchUrl returns UrlMatch | null", () => {
    expectTypeOf(matchUrl).returns.toEqualTypeOf<UrlMatch | null>();
  });

  it("UrlMatch shape", () => {
    expectTypeOf<UrlMatch["terminal"]>().toExtend<RouteNode>();
    expectTypeOf<UrlMatch["renderChain"]>().toEqualTypeOf<readonly RouteNode[]>();
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
