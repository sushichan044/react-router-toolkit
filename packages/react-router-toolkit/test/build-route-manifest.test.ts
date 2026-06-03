import { describe, expect, it as baseIt } from "vite-plus/test";

import { buildRouteManifest, loadRoutes, RouteManifestError } from "../src/index";
import { appDir, fixtureRoot } from "./fixture";
import { makeTempDir } from "./utils";

const it = baseIt.extend<{ cacheDir: string }>({
  cacheDir: async ({}, use) => {
    await using cacheDir = await makeTempDir(import.meta.filename);
    await use(cacheDir.path);
  },
});

describe("buildRouteManifest", () => {
  it("nests routes under a synthesized root route and keys them by id", async ({ cacheDir }) => {
    const app = appDir("minimal");
    const { config } = await loadRoutes(app, fixtureRoot("minimal"), { cacheDir });
    const manifest = buildRouteManifest(app, config);

    expect(manifest["root"]).toMatchObject({ file: "root.tsx", path: "" });
    expect(manifest["root"]?.parentId).toBeUndefined();
    expect(manifest["home"]).toMatchObject({ parentId: "root", index: true, file: "home.tsx" });
    expect(manifest["about"]).toMatchObject({ parentId: "root", path: "about" });
  });

  it("throws RouteManifestError on duplicate route ids", async ({ cacheDir }) => {
    const app = appDir("id-conflict");
    const { config } = await loadRoutes(app, fixtureRoot("id-conflict"), { cacheDir });

    expect(() => buildRouteManifest(app, config)).toThrow(RouteManifestError);
  });

  it("throws RouteManifestError when no root route module exists", () => {
    expect(() => buildRouteManifest(appDir("minimal", "does-not-exist"), [])).toThrow(
      RouteManifestError,
    );
  });
});
