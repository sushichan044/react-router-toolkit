import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { evaluateRoutesFile, loadRouteTree, RouteEvaluationError, RouteManifestError } from ".";
import { buildRouteIndex } from "./utils";

const FIXTURES_DIR = fileURLToPath(import.meta.resolve("../test/fixtures"));

function fixtureRoot(name: string): string {
  return resolve(FIXTURES_DIR, name);
}

describe("evaluateRoutesFile", () => {
  it("evaluates a minimal routes.ts and returns the RouteConfigEntry[] default", async () => {
    const entries = await evaluateRoutesFile({ root: fixtureRoot("minimal") });
    const files = entries.map((e) => e.file);
    expect(files).toContain("home.tsx");
    expect(files).toContain("about.tsx");
  });

  it("supports async default exports", async () => {
    const entries = await evaluateRoutesFile({
      root: fixtureRoot("async-routes"),
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.file).toBe("about.tsx");
  });

  it("throws RouteEvaluationError when routes.ts cannot be found", async () => {
    await expect(
      evaluateRoutesFile({ root: fixtureRoot("does-not-exist") }),
    ).rejects.toBeInstanceOf(RouteEvaluationError);
  });
});

describe("loadRouteTree", () => {
  it("evaluates routes.ts and synthesizes the root.tsx layout at the top", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("minimal") });
    expect(tree.kind).toBe("layout");
    expect(tree.id).toBe("root");
    expect(tree.file).toBe("root.tsx");

    const index = buildRouteIndex(tree);
    expect(index.size).toBe(3); // root + 2 user routes
    const home = index.get("home");
    expect(home?.kind).toBe("index");
    expect(home?.fullPath).toBe("/");
  });

  it("preserves the layout → child relationship and uses 'root' as the topmost parent", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("layout-only") });
    const index = buildRouteIndex(tree);
    expect(index.size).toBe(4); // root + 3 user routes
    const login = [...index.values()].find((n) => n.file === "login.tsx");
    const layout = [...index.values()].find((n) => n.file === "auth-layout.tsx");
    expect(login?.parentId).toBe(layout?.id);
    expect(layout?.parentId).toBe("root");
    expect(layout?.kind).toBe("layout");
  });

  it("expands prefix() into joined URL patterns", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("prefix") });
    const index = buildRouteIndex(tree);
    const city = [...index.values()].find((n) => n.file === "concerts/city.tsx");
    expect(city?.fullPath).toBe("/concerts/:city");
    const home = [...index.values()].find((n) => n.file === "concerts/home.tsx");
    expect(home?.fullPath).toBe("/concerts");
    // prefix() on an index produces an IndexRouteNode that carries the prefix as its own path.
    expect(home?.kind).toBe("index");
    expect(home?.kind === "index" && home.path).toBe("concerts");
  });

  it("walks deeply nested route trees", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("nested-deep") });
    const index = buildRouteIndex(tree);
    expect(index.size).toBe(5); // root + 4 user routes
    const innerIndex = [...index.values()].find((n) => n.file === "inner-index.tsx");
    expect(innerIndex?.fullPath).toBe("/section/:id");
  });

  it("preserves splat segments in fullPath", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("splat") });
    const files = [...buildRouteIndex(tree).values()].find((n) => n.file === "files.tsx");
    expect(files?.fullPath).toBe("/files/*");
  });

  it("uses an explicit id when one is given", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("explicit-id") });
    expect(buildRouteIndex(tree).has("my-about")).toBe(true);
  });

  it("throws RouteManifestError when two entries share an id", async () => {
    await expect(loadRouteTree({ root: fixtureRoot("id-conflict") })).rejects.toBeInstanceOf(
      RouteManifestError,
    );
  });

  it("normalises absolute file paths produced by `relative()` back to app-relative", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("relative-helper") });
    const index = buildRouteIndex(tree);
    const files = [...index.values()].map((node) => node.file);
    expect(files).toContain("home.tsx");
    expect(files).toContain("about.tsx");
    const home = [...index.values()].find((n) => n.file === "home.tsx");
    expect(home?.id).toBe("home");
  });

  it("loads the project's vite.config.ts so aliases resolve", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("with-vite-config") });
    const city = [...buildRouteIndex(tree).values()].find((n) => n.file === "city.tsx");
    expect(city?.fullPath).toBe("/:city");
  });
});
