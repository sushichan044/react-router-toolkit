import { isAbsolute } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { loadRoutes, RouteEvaluationError, RouteValidationError } from "../src/index";
import { appDir, fixtureRoot, isolatedCacheDir } from "./fixture";

const TIMEOUT = 30_000;
const cacheDir = isolatedCacheDir();

describe("loadRoutes", () => {
  it(
    "evaluates routes.ts and returns the raw route config entries",
    async () => {
      const { config, configFile } = await loadRoutes(appDir("minimal"), fixtureRoot("minimal"), {
        cacheDir,
      });

      expect(isAbsolute(configFile)).toBe(true);
      expect(configFile.endsWith("routes.ts")).toBe(true);
      expect(config).toHaveLength(2);
      expect(config[0]).toMatchObject({ file: "home.tsx", index: true });
      expect(config[1]).toMatchObject({ file: "about.tsx", path: "about" });
    },
    TIMEOUT,
  );

  it(
    "awaits a routes.ts whose default export is a promise",
    async () => {
      const { config } = await loadRoutes(appDir("async-routes"), fixtureRoot("async-routes"), {
        cacheDir,
      });

      expect(config).toHaveLength(1);
      expect(config[0]).toMatchObject({ file: "about.tsx", path: "about" });
    },
    TIMEOUT,
  );

  it(
    "throws RouteEvaluationError when routes.ts is missing",
    async () => {
      await expect(
        loadRoutes(appDir("missing-routes"), fixtureRoot("missing-routes"), { cacheDir }),
      ).rejects.toBeInstanceOf(RouteEvaluationError);
    },
    TIMEOUT,
  );

  it(
    "throws RouteValidationError when a route uses the reserved id 'root'",
    async () => {
      await expect(
        loadRoutes(appDir("root-id"), fixtureRoot("root-id"), { cacheDir }),
      ).rejects.toBeInstanceOf(RouteValidationError);
    },
    TIMEOUT,
  );
});
