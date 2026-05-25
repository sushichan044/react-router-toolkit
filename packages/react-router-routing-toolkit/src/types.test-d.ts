import { describe, expectTypeOf, it } from "vite-plus/test";

import { createRouteManifest, evaluateRoutesFile } from ".";
import { flattenToManifest } from "./flattener";
import type {
  CreateRouteManifestOptions,
  LayoutChainEntry,
  LeafRoute,
  RouteConfigEntry,
  RouteManifest,
  RouteManifestEntry,
  UrlMatch,
} from "./types";
import {
  RouteEvaluationError,
  RouteManifestError,
  RouteToolkitError,
  RouteValidationError,
} from "./types";
import { findByFile, getLayoutChain, getRouteById, listRoutes, matchUrl } from "./utils";

describe("type contract", () => {
  it("createRouteManifest returns Promise<RouteManifest>", () => {
    expectTypeOf(createRouteManifest).returns.toEqualTypeOf<Promise<RouteManifest>>();
  });

  it("createRouteManifest accepts an optional options object", () => {
    expectTypeOf(createRouteManifest)
      .parameter(0)
      .toEqualTypeOf<CreateRouteManifestOptions | undefined>();
  });

  it("evaluateRoutesFile returns Promise<RouteConfigEntry[]>", () => {
    expectTypeOf(evaluateRoutesFile).returns.toEqualTypeOf<Promise<RouteConfigEntry[]>>();
  });

  it("flattenToManifest accepts readonly RouteConfigEntry[]", () => {
    expectTypeOf(flattenToManifest).parameter(0).toEqualTypeOf<readonly RouteConfigEntry[]>();
  });

  it("flattenToManifest returns RouteManifest", () => {
    expectTypeOf(flattenToManifest).returns.toEqualTypeOf<RouteManifest>();
  });

  it("RouteManifest is a ReadonlyMap keyed by string", () => {
    expectTypeOf<RouteManifest>().toEqualTypeOf<ReadonlyMap<string, RouteManifestEntry>>();
  });

  it("listRoutes returns readonly LeafRoute[]", () => {
    expectTypeOf(listRoutes).returns.toEqualTypeOf<readonly LeafRoute[]>();
  });

  it("matchUrl returns UrlMatch | null", () => {
    expectTypeOf(matchUrl).returns.toEqualTypeOf<UrlMatch | null>();
  });

  it("getLayoutChain returns readonly LayoutChainEntry[]", () => {
    expectTypeOf(getLayoutChain).returns.toEqualTypeOf<readonly LayoutChainEntry[]>();
  });

  it("findByFile returns RouteManifestEntry | undefined", () => {
    expectTypeOf(findByFile).returns.toEqualTypeOf<RouteManifestEntry | undefined>();
  });

  it("getRouteById returns RouteManifestEntry", () => {
    expectTypeOf(getRouteById).returns.toEqualTypeOf<RouteManifestEntry>();
  });

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
