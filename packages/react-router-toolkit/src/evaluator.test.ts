import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { RouteEvaluationError, RouteManifestError } from "./errors";
import { resolveRouteManifest } from "./evaluator";
import { loadRouteTree } from "./index";
import { buildRouteIndex } from "./utils";

const FIXTURES_DIR = fileURLToPath(import.meta.resolve("../test/fixtures"));

function fixtureRoot(name: string): string {
  return resolve(FIXTURES_DIR, name);
}

describe("resolveRouteManifest", () => {
  it("returns React Router's resolved appDirectory and route manifest", async () => {
    const { appDirectory, routes } = await resolveRouteManifest({ root: fixtureRoot("minimal") });
    expect(appDirectory).toBe(resolve(fixtureRoot("minimal"), "app"));

    const files = Object.values(routes).map((entry) => entry.file);
    expect(files).toContain("root.tsx");
    expect(files).toContain("home.tsx");
    expect(files).toContain("about.tsx");
  });

  it("resolves routes.ts that default-exports a promise", async () => {
    const { routes } = await resolveRouteManifest({ root: fixtureRoot("async-routes") });
    const files = Object.values(routes).map((entry) => entry.file);
    expect(files).toContain("about.tsx");
  });

  it("throws RouteEvaluationError when the project's routes cannot be resolved", async () => {
    await expect(
      resolveRouteManifest({ root: fixtureRoot("does-not-exist") }),
    ).rejects.toBeInstanceOf(RouteEvaluationError);
  });
});

describe("loadRouteTree", () => {
  it("synthesizes the root.tsx layout at the top from the resolved manifest", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("minimal") });
    expect(tree.kind).toBe("layout");
    expect(tree.id).toBe("root");
    expect(tree.file).toBe("root.tsx");

    const index = buildRouteIndex(tree);
    expect(index.size).toBe(3); // root + 2 user routes
    const home = [...index.values()].find((n) => n.file === "home.tsx");
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

  it("surfaces React Router's duplicate-id rejection as a RouteManifestError", async () => {
    await expect(loadRouteTree({ root: fixtureRoot("id-conflict") })).rejects.toBeInstanceOf(
      RouteManifestError,
    );
  });

  it("normalises absolute file paths from relative() to app-relative, keeping React Router's id verbatim", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("relative-helper") });
    const index = buildRouteIndex(tree);
    const files = [...index.values()].map((node) => node.file);
    expect(files).toContain("home.tsx");
    expect(files).toContain("about.tsx");
    // React Router derives the id from the (absolute) file path the relative() helper produced, so
    // the manifest id is an absolute path. The toolkit surfaces it verbatim.
    const home = [...index.values()].find((n) => n.file === "home.tsx");
    expect(home).toBeDefined();
    expect(isAbsolute(home!.id)).toBe(true);
    expect(home!.id.endsWith("/home")).toBe(true);
  });

  it("loads the project's vite.config.ts so aliases resolve", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("with-vite-config") });
    const city = [...buildRouteIndex(tree).values()].find((n) => n.file === "city.tsx");
    expect(city?.fullPath).toBe("/:city");
  });

  it("can process fs routes", async () => {
    const tree = await loadRouteTree({ root: fixtureRoot("fs-routes") });
    const index = buildRouteIndex(tree);
    expect(index.size).toBe(3); // root + 2 user routes
    const hello = [...index.values()].find((n) => n.file === "routes/hello.tsx");
    expect(hello?.fullPath).toBe("/hello");
    const indexRoute = [...index.values()].find((n) => n.file === "routes/_index.tsx");
    expect(indexRoute?.fullPath).toBe("/");
  });
});
