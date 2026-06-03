import { isAbsolute, resolve } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  resolveReactRouterConfig,
  RouteEvaluationError,
  RouteManifestError,
  RouteValidationError,
} from "../src/index";
import { fixtureRoot, isolatedCacheDir } from "./fixture";

const TIMEOUT = 30_000;
const cacheDir = isolatedCacheDir();

describe("resolveReactRouterConfig", () => {
  it(
    "applies React Router's defaults",
    async () => {
      const root = fixtureRoot("minimal");
      const resolved = await resolveReactRouterConfig(root, { cacheDir });

      expect(resolved.appDirectory).toBe(resolve(root, "app"));
      expect(resolved.buildDirectory).toBe(resolve(root, "build"));
      expect(resolved.basename).toBe("/");
      expect(resolved.ssr).toBe(true);
      expect(resolved.serverBuildFile).toBe("index.js");
      expect(resolved.serverModuleFormat).toBe("esm");
      expect(resolved.subResourceIntegrity).toBe(false);
      expect(resolved.allowedActionOrigins).toBe(false);
      expect(resolved.routeDiscovery).toEqual({ mode: "lazy", manifestPath: "/__manifest" });
      expect(resolved.future.v8_middleware).toBe(false);
    },
    TIMEOUT,
  );

  it(
    "assembles the route manifest nested under the root route",
    async () => {
      const resolved = await resolveReactRouterConfig(fixtureRoot("minimal"), { cacheDir });

      expect(Object.keys(resolved.routes).sort()).toEqual(["about", "home", "root"]);
      expect(resolved.unstable_routeConfig).toHaveLength(1);
      expect(resolved.unstable_routeConfig[0]?.id).toBe("root");
      expect(resolved.unstable_routeConfig[0]?.children).toHaveLength(2);
    },
    TIMEOUT,
  );

  it(
    "returns a deeply frozen config",
    async () => {
      const resolved = await resolveReactRouterConfig(fixtureRoot("minimal"), { cacheDir });

      expect(Object.isFrozen(resolved)).toBe(true);
      expect(Object.isFrozen(resolved.routes)).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "honors appDirectory from react-router.config and resolves fs-routes",
    async () => {
      const root = fixtureRoot("custom-app-dir");
      const resolved = await resolveReactRouterConfig(root, { cacheDir });

      expect(resolved.appDirectory).toBe(resolve(root, "src"));
      expect(Object.keys(resolved.routes)).toContain("routes/hello");
      expect(resolved.routes["routes/hello"]?.path).toBe("hello");
    },
    TIMEOUT,
  );

  it(
    "resolves config only, with an empty manifest, when skipRoutes is set",
    async () => {
      const root = fixtureRoot("minimal");
      const resolved = await resolveReactRouterConfig(root, { skipRoutes: true, cacheDir });

      expect(resolved.routes).toEqual({});
      expect(resolved.unstable_routeConfig).toHaveLength(0);
      expect(resolved.appDirectory).toBe(resolve(root, "app"));
    },
    TIMEOUT,
  );

  it(
    "loads the project's vite.config so import aliases in routes.ts resolve",
    async () => {
      const resolved = await resolveReactRouterConfig(fixtureRoot("with-vite-config"), {
        cacheDir,
      });

      expect(resolved.routes["city"]).toMatchObject({ path: ":city", file: "city.tsx" });
    },
    TIMEOUT,
  );

  it(
    "expands prefix() into per-entry paths",
    async () => {
      const resolved = await resolveReactRouterConfig(fixtureRoot("prefix"), { cacheDir });

      expect(resolved.routes["concerts/city"]?.path).toBe("concerts/:city");
      expect(resolved.routes["concerts/home"]).toMatchObject({ path: "concerts", index: true });
    },
    TIMEOUT,
  );

  it(
    "preserves splat segments",
    async () => {
      const resolved = await resolveReactRouterConfig(fixtureRoot("splat"), { cacheDir });

      expect(resolved.routes["files"]?.path).toBe("files/*");
    },
    TIMEOUT,
  );

  it(
    "keeps React Router's absolute id from the relative() helper while normalizing file to app-relative",
    async () => {
      const resolved = await resolveReactRouterConfig(fixtureRoot("relative-helper"), { cacheDir });

      const home = Object.values(resolved.routes).find((entry) => entry.file === "home.tsx");
      expect(home).toBeDefined();
      expect(isAbsolute(home!.id)).toBe(true);
      expect(home!.id.endsWith("/home")).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "uses an explicit route id when provided",
    async () => {
      const resolved = await resolveReactRouterConfig(fixtureRoot("explicit-id"), { cacheDir });

      expect(Object.keys(resolved.routes)).toContain("my-about");
    },
    TIMEOUT,
  );

  it(
    "throws RouteManifestError on duplicate route ids",
    async () => {
      await expect(
        resolveReactRouterConfig(fixtureRoot("id-conflict"), { cacheDir }),
      ).rejects.toBeInstanceOf(RouteManifestError);
    },
    TIMEOUT,
  );

  it(
    "propagates RouteValidationError for the reserved 'root' id",
    async () => {
      await expect(
        resolveReactRouterConfig(fixtureRoot("root-id"), { cacheDir }),
      ).rejects.toBeInstanceOf(RouteValidationError);
    },
    TIMEOUT,
  );

  it(
    "propagates RouteEvaluationError when routes.ts is missing",
    async () => {
      await expect(
        resolveReactRouterConfig(fixtureRoot("missing-routes"), { cacheDir }),
      ).rejects.toBeInstanceOf(RouteEvaluationError);
    },
    TIMEOUT,
  );
});
