import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import {
  createRouteManifest,
  evaluateRoutesFile,
  RouteEvaluationError,
  RouteManifestError,
} from ".";

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

describe("createRouteManifest", () => {
  it("evaluates and flattens a minimal app", async () => {
    const manifest = await createRouteManifest({ root: fixtureRoot("minimal") });
    expect(manifest.size).toBe(2);
    const home = [...manifest.values()].find((e) => e.file === "home.tsx");
    expect(home?.index).toBe(true);
    expect(home?.fullPath).toBe("/");
  });

  it("preserves the layout → child relationship", async () => {
    const manifest = await createRouteManifest({
      root: fixtureRoot("layout-only"),
    });
    expect(manifest.size).toBe(3);
    const login = [...manifest.values()].find((e) => e.file === "login.tsx");
    const layout = [...manifest.values()].find((e) => e.file === "auth-layout.tsx");
    expect(login?.parentId).toBe(layout?.id);
    expect(layout?.isLayout).toBe(true);
  });

  it("expands prefix() into joined URL patterns", async () => {
    const manifest = await createRouteManifest({ root: fixtureRoot("prefix") });
    const city = [...manifest.values()].find((e) => e.file === "concerts/city.tsx");
    expect(city?.fullPath).toBe("/concerts/:city");
    const home = [...manifest.values()].find((e) => e.file === "concerts/home.tsx");
    expect(home?.fullPath).toBe("/concerts");
  });

  it("walks deeply nested route trees", async () => {
    const manifest = await createRouteManifest({
      root: fixtureRoot("nested-deep"),
    });
    expect(manifest.size).toBe(4);
    const innerIndex = [...manifest.values()].find((e) => e.file === "inner-index.tsx");
    expect(innerIndex?.fullPath).toBe("/section/:id");
  });

  it("preserves splat segments in fullPath", async () => {
    const manifest = await createRouteManifest({ root: fixtureRoot("splat") });
    const files = [...manifest.values()].find((e) => e.file === "files.tsx");
    expect(files?.fullPath).toBe("/files/*");
  });

  it("uses an explicit id when one is given", async () => {
    const manifest = await createRouteManifest({
      root: fixtureRoot("explicit-id"),
    });
    expect(manifest.has("my-about")).toBe(true);
  });

  it("throws RouteManifestError when two entries share an id", async () => {
    await expect(createRouteManifest({ root: fixtureRoot("id-conflict") })).rejects.toBeInstanceOf(
      RouteManifestError,
    );
  });

  it("normalises absolute file paths produced by `relative()` back to app-relative", async () => {
    const manifest = await createRouteManifest({
      root: fixtureRoot("relative-helper"),
    });
    const files = [...manifest.values()].map((entry) => entry.file);
    expect(files).toContain("home.tsx");
    expect(files).toContain("about.tsx");
    const home = [...manifest.values()].find((e) => e.file === "home.tsx");
    expect(home?.id).toBe("home");
  });

  it("loads the project's vite.config.ts so aliases resolve", async () => {
    const manifest = await createRouteManifest({
      root: fixtureRoot("with-vite-config"),
    });
    const city = [...manifest.values()].find((e) => e.file === "city.tsx");
    expect(city?.fullPath).toBe("/:city");
  });
});
