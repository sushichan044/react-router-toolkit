import { mkdtempDisposable } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { basename } from "pathe";
import { describe, expect, it as baseIt } from "vite-plus/test";

import { loadRoutes, RouteEvaluationError, RouteValidationError } from "../src/index";
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
});
