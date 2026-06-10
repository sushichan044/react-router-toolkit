import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { create } from "@platformatic/vfs";
import { describe, expect, it } from "vite-plus/test";

import { analyzeRouteModules } from "../src/route-module-info";
import type { RouteModuleInfo } from "../src/schemas";
import { appDir } from "./fixture";

const APP = appDir("route-module-exports");

/** Analyze a single fixture route module and return its info. */
async function analyzeOne(file: string): Promise<RouteModuleInfo> {
  const result = await analyzeRouteModules({
    appDirectory: APP,
    routes: { route: { id: "route", file } },
  });
  return result["route"]!;
}

describe("analyzeRouteModules export analysis", () => {
  it("records an async function loader and a function default component", async () => {
    const info = await analyzeOne("routes/async-loader.tsx");

    expect(info.exports.loader).not.toBeNull();
    expect(info.exports.loader?.declarationKind).toBe("function");
    expect(info.exports.loader?.isAsync).toBe(true);
    expect(info.exports.loader?.reexportSource).toBeNull();

    expect(info.exports.default?.declarationKind).toBe("function");
    expect(info.exports.default?.isAsync).toBe(false);
  });

  it("reports absent exports as null", async () => {
    const info = await analyzeOne("routes/async-loader.tsx");

    expect(info.exports.action).toBeNull();
    expect(info.exports.meta).toBeNull();
    expect(info.exports.clientLoader).toBeNull();
  });

  it("records an async arrow-function action", async () => {
    const info = await analyzeOne("routes/arrow-action.tsx");

    expect(info.exports.action?.declarationKind).toBe("arrow");
    expect(info.exports.action?.isAsync).toBe(true);
  });

  it("records a default class component", async () => {
    const info = await analyzeOne("routes/class-component.tsx");

    expect(info.exports.default?.declarationKind).toBe("class");
    expect(info.exports.default?.isAsync).toBe(false);
  });

  it("records a cross-file re-exported loader with its source", async () => {
    const info = await analyzeOne("routes/reexported-loader.tsx");

    expect(info.exports.loader?.declarationKind).toBe("reexport");
    expect(info.exports.loader?.reexportSource).toBe("./loader-impl");
    expect(info.exports.loader?.isAsync).toBe(false);
  });

  it("records a local re-export with a null source", async () => {
    const info = await analyzeOne("routes/local-reexport.tsx");

    expect(info.exports.loader?.declarationKind).toBe("reexport");
    expect(info.exports.loader?.reexportSource).toBeNull();
  });

  it("flags clientLoader.hydrate when the assignment is present", async () => {
    const info = await analyzeOne("routes/client-loader-hydrate.tsx");

    expect(info.exports.clientLoader).not.toBeNull();
    expect(info.exports.clientLoader?.declarationKind).toBe("arrow");
    expect(info.exports.clientLoader?.isAsync).toBe(true);
    expect(info.exports.clientLoader?.hydrate).toBe(true);
  });

  it("defaults clientLoader.hydrate to false without an assignment", async () => {
    const info = await analyzeOne("routes/client-loader-no-hydrate.tsx");

    expect(info.exports.clientLoader).not.toBeNull();
    expect(info.exports.clientLoader?.hydrate).toBe(false);
  });

  it("keeps unrecognized exports out of the known slots", async () => {
    const info = await analyzeOne("routes/unknown-export.tsx");

    expect(info.exports.loader).toBeNull();
    expect(info.unknownExports).toHaveLength(1);
    expect(info.unknownExports[0]?.name).toBe("loaer");
    expect(info.unknownExports[0]?.declarationKind).toBe("arrow");
  });

  it("records only the default export for a default-only module", async () => {
    const info = await analyzeOne("routes/default-only.tsx");

    expect(info.exports.default).not.toBeNull();
    expect(info.unknownExports).toEqual([]);
    const presentNames = Object.entries(info.exports)
      .filter(([, value]) => value !== null)
      .map(([name]) => name);
    expect(presentNames).toEqual(["default"]);
  });

  it("records multiple exports declared in one statement", async () => {
    const info = await analyzeOne("routes/multiple-vars.tsx");

    expect(info.exports.links?.declarationKind).toBe("arrow");
    expect(info.exports.meta?.declarationKind).toBe("arrow");
  });

  it("collects outlets and exports from the same module", async () => {
    const info = await analyzeOne("routes/outlet-and-loader.tsx");

    expect(info.outlets.length).toBeGreaterThan(0);
    expect(info.exports.loader).not.toBeNull();
  });

  it("ignores outlets declared inside non-rendered nested helpers", async () => {
    const info = await analyzeOne("routes/nested-helper-outlet.tsx");

    expect(info.outlets).toEqual([]);
  });

  it("collects outlets rendered through a non-exported local component", async () => {
    const info = await analyzeOne("routes/local-component-outlet.tsx");

    expect(info.outlets).toHaveLength(1);
  });

  it("collects outlets from a local component whose name is also re-exported from another module", async () => {
    const info = await analyzeOne("routes/reexport-name-shadow.tsx");

    expect(info.outlets).toHaveLength(1);
  });

  it("collects outlets from a function-expression default export", async () => {
    const info = await analyzeOne("routes/function-expression-default.tsx");

    expect(info.outlets).toHaveLength(1);
  });

  it("returns empty analysis with fileExists false for a missing file without throwing", async () => {
    const info = await analyzeOne("routes/does-not-exist.tsx");

    expect(info.fileExists).toBe(false);
    expect(info.outlets).toEqual([]);
    expect(info.unknownExports).toEqual([]);
    expect(info.exports.default).toBeNull();
    expect(info.exports.loader).toBeNull();
  });

  it("marks an analyzable module with fileExists true", async () => {
    const info = await analyzeOne("routes/async-loader.tsx");

    expect(info.fileExists).toBe(true);
  });

  it("captures a span that points at the declaration source", async () => {
    const file = "routes/async-loader.tsx";
    const info = await analyzeOne(file);
    const source = readFileSync(resolve(APP, file), "utf8");

    const span = info.exports.loader!.span;
    expect(source.slice(span.start, span.end)).toContain("export async function loader");
  });
});

describe("analyzeRouteModules with a virtual filesystem", () => {
  it("analyzes modules from an in-memory filesystem without touching disk", async () => {
    const files = create({ moduleHooks: false });
    await files.promises.mkdir("/routes", { recursive: true });
    await files.promises.writeFile(
      "/routes/home.tsx",
      "export default function Home() {\n  return null;\n}\n",
    );

    const result = await analyzeRouteModules(
      { appDirectory: "/virtual-app", routes: { home: { id: "home", file: "routes/home.tsx" } } },
      files,
    );

    expect(result["home"]?.fileExists).toBe(true);
    expect(result["home"]?.exports.default?.declarationKind).toBe("function");
  });

  it("marks routes whose module is absent from the filesystem as missing", async () => {
    const files = create({ moduleHooks: false });

    const result = await analyzeRouteModules(
      { appDirectory: "/virtual-app", routes: { gone: { id: "gone", file: "routes/gone.tsx" } } },
      files,
    );

    expect(result["gone"]?.fileExists).toBe(false);
    expect(result["gone"]?.exports.default).toBeNull();
  });
});
