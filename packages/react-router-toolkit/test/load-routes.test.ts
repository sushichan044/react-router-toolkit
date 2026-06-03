import { isAbsolute } from "node:path";

import type { Plugin } from "vite";
import { describe, expect, it as baseIt } from "vite-plus/test";

import {
  flattenRouteTree,
  loadRoutes,
  RouteEvaluationError,
  RouteValidationError,
} from "../src/index";
import { appDir, fixtureRoot } from "./fixture";
import { makeTempDir } from "./utils";

const it = baseIt.extend<{ cacheDir: string }>({
  cacheDir: async ({}, use) => {
    await using cacheDir = await makeTempDir(import.meta.filename);
    await use(cacheDir.path);
  },
});

describe("loadRoutes", () => {
  it("evaluates routes.ts and returns the raw route config entries", async ({ cacheDir }) => {
    const { config, configFile } = await loadRoutes(appDir("minimal"), fixtureRoot("minimal"), {
      cacheDir,
    });

    expect(isAbsolute(configFile)).toBe(true);
    expect(configFile.endsWith("routes.ts")).toBe(true);
    expect(config).toHaveLength(2);
    expect(config[0]).toMatchObject({ file: "home.tsx", index: true });
    expect(config[1]).toMatchObject({ file: "about.tsx", path: "about" });
  });

  it("awaits a routes.ts whose default export is a promise", async ({ cacheDir }) => {
    const { config } = await loadRoutes(appDir("async-routes"), fixtureRoot("async-routes"), {
      cacheDir,
    });

    expect(config).toHaveLength(1);
    expect(config[0]).toMatchObject({ file: "about.tsx", path: "about" });
  });

  it("throws RouteEvaluationError when routes.ts is missing", async ({ cacheDir }) => {
    await expect(
      loadRoutes(appDir("missing-routes"), fixtureRoot("missing-routes"), { cacheDir }),
    ).rejects.toBeInstanceOf(RouteEvaluationError);
  });

  it("throws RouteValidationError when a route uses the reserved id 'root'", async ({
    cacheDir,
  }) => {
    await expect(
      loadRoutes(appDir("root-id"), fixtureRoot("root-id"), { cacheDir }),
    ).rejects.toBeInstanceOf(RouteValidationError);
  });

  it("evaluates the routing branch selected by a caller-provided define", async ({ cacheDir }) => {
    const root = fixtureRoot("import-meta-branch");
    const app = appDir("import-meta-branch");

    const fsRoutes = await loadRoutes(app, root, {
      cacheDir,
      vite: { define: { "import.meta.env.RR_USE_FS_ROUTES": "true" } },
    });
    const manualRoutes = await loadRoutes(app, root, {
      cacheDir,
      vite: { define: { "import.meta.env.RR_USE_FS_ROUTES": "false" } },
    });

    // Both branches expose the same URLs wrapped by the same layouts — the snapshot-test use case.
    const expected = {
      "/": { file: "routes/_index.tsx", layouts: [] },
      "/hello": { file: "routes/hello.tsx", layouts: [] },
    };
    expect(flattenRouteTree(manualRoutes.config)).toStrictEqual(expected);
    expect(flattenRouteTree(fsRoutes.config)).toStrictEqual(flattenRouteTree(manualRoutes.config));
  });

  it("applies caller-provided plugins when evaluating routes.ts", async ({ cacheDir }) => {
    const virtualModule: Plugin = {
      name: "test:virtual-routes",
      resolveId(id) {
        return id === "virtual:toolkit-test" ? `\0${id}` : undefined;
      },
      load(id) {
        return id === "\0virtual:toolkit-test" ? `export const extraPath = "injected";` : undefined;
      },
    };

    const { config } = await loadRoutes(appDir("plugin-virtual"), fixtureRoot("plugin-virtual"), {
      cacheDir,
      vite: { plugins: [virtualModule] },
    });

    expect(config).toHaveLength(1);
    expect(config[0]).toMatchObject({ file: "home.tsx", path: "injected" });
  });
});
