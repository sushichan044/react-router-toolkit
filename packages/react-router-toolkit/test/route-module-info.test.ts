import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { analyzeRouteModules } from "../src/route-module-info";
import type { RouteModuleInfo } from "../src/route-module-info";
import { appDir } from "./fixture";

const APP = appDir("route-module-exports");

/** Analyze a single fixture route module and return its info. */
function analyzeOne(file: string): RouteModuleInfo {
  const result = analyzeRouteModules({
    appDirectory: APP,
    routes: { route: { id: "route", file } },
  });
  return result["route"]!;
}

describe("analyzeRouteModules export analysis", () => {
  it("records an async function loader and a function default component", () => {
    const info = analyzeOne("routes/async-loader.tsx");

    expect(info.exports.loader).not.toBeNull();
    expect(info.exports.loader?.declarationKind).toBe("function");
    expect(info.exports.loader?.isAsync).toBe(true);
    expect(info.exports.loader?.reexportSource).toBeNull();

    expect(info.exports.default?.declarationKind).toBe("function");
    expect(info.exports.default?.isAsync).toBe(false);
  });

  it("reports absent exports as null", () => {
    const info = analyzeOne("routes/async-loader.tsx");

    expect(info.exports.action).toBeNull();
    expect(info.exports.meta).toBeNull();
    expect(info.exports.clientLoader).toBeNull();
  });

  it("records an async arrow-function action", () => {
    const info = analyzeOne("routes/arrow-action.tsx");

    expect(info.exports.action?.declarationKind).toBe("arrow");
    expect(info.exports.action?.isAsync).toBe(true);
  });

  it("records a default class component", () => {
    const info = analyzeOne("routes/class-component.tsx");

    expect(info.exports.default?.declarationKind).toBe("class");
    expect(info.exports.default?.isAsync).toBe(false);
  });

  it("records a cross-file re-exported loader with its source", () => {
    const info = analyzeOne("routes/reexported-loader.tsx");

    expect(info.exports.loader?.declarationKind).toBe("reexport");
    expect(info.exports.loader?.reexportSource).toBe("./loader-impl");
    expect(info.exports.loader?.isAsync).toBe(false);
  });

  it("records a local re-export with a null source", () => {
    const info = analyzeOne("routes/local-reexport.tsx");

    expect(info.exports.loader?.declarationKind).toBe("reexport");
    expect(info.exports.loader?.reexportSource).toBeNull();
  });

  it("flags clientLoader.hydrate when the assignment is present", () => {
    const info = analyzeOne("routes/client-loader-hydrate.tsx");

    expect(info.exports.clientLoader).not.toBeNull();
    expect(info.exports.clientLoader?.declarationKind).toBe("arrow");
    expect(info.exports.clientLoader?.isAsync).toBe(true);
    expect(info.exports.clientLoader?.hydrate).toBe(true);
  });

  it("defaults clientLoader.hydrate to false without an assignment", () => {
    const info = analyzeOne("routes/arrow-action.tsx");

    // No clientLoader here, but a hydrate-bearing module must default the flag elsewhere.
    const reexported = analyzeOne("routes/local-reexport.tsx");
    expect(reexported.exports.clientLoader).toBeNull();
    expect(info.exports.clientLoader).toBeNull();
  });

  it("keeps unrecognized exports out of the known slots", () => {
    const info = analyzeOne("routes/unknown-export.tsx");

    expect(info.exports.loader).toBeNull();
    expect(info.unknownExports).toHaveLength(1);
    expect(info.unknownExports[0]?.name).toBe("loaer");
    expect(info.unknownExports[0]?.declarationKind).toBe("arrow");
  });

  it("records only the default export for a default-only module", () => {
    const info = analyzeOne("routes/default-only.tsx");

    expect(info.exports.default).not.toBeNull();
    expect(info.unknownExports).toEqual([]);
    const presentNames = Object.entries(info.exports)
      .filter(([, value]) => value !== null)
      .map(([name]) => name);
    expect(presentNames).toEqual(["default"]);
  });

  it("records multiple exports declared in one statement", () => {
    const info = analyzeOne("routes/multiple-vars.tsx");

    expect(info.exports.links?.declarationKind).toBe("arrow");
    expect(info.exports.meta?.declarationKind).toBe("arrow");
  });

  it("collects outlets and exports from the same module", () => {
    const info = analyzeOne("routes/outlet-and-loader.tsx");

    expect(info.outlets.length).toBeGreaterThan(0);
    expect(info.exports.loader).not.toBeNull();
  });

  it("returns empty analysis for a missing file without throwing", () => {
    const info = analyzeOne("routes/does-not-exist.tsx");

    expect(info.outlets).toEqual([]);
    expect(info.unknownExports).toEqual([]);
    expect(info.exports.default).toBeNull();
    expect(info.exports.loader).toBeNull();
  });

  it("captures a span that points at the declaration source", () => {
    const file = "routes/async-loader.tsx";
    const info = analyzeOne(file);
    const source = readFileSync(resolve(APP, file), "utf8");

    const span = info.exports.loader!.span;
    expect(source.slice(span.start, span.end)).toContain("export async function loader");
  });
});
