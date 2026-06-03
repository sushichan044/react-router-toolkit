import { isAbsolute } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { loadReactRouterConfig } from "../src/index";
import { fixtureRoot, isolatedCacheDir } from "./fixture";

const TIMEOUT = 30_000;
const cacheDir = isolatedCacheDir();

describe("loadReactRouterConfig", () => {
  it(
    "returns null when the project has no react-router.config file",
    async () => {
      expect(await loadReactRouterConfig(fixtureRoot("minimal"), { cacheDir })).toBeNull();
    },
    TIMEOUT,
  );

  it(
    "evaluates react-router.config.ts and returns its raw default export",
    async () => {
      const loaded = await loadReactRouterConfig(fixtureRoot("custom-app-dir"), { cacheDir });

      expect(loaded).not.toBeNull();
      expect(isAbsolute(loaded!.configFile)).toBe(true);
      expect(loaded!.configFile.endsWith("react-router.config.ts")).toBe(true);
      expect(loaded!.config.appDirectory).toBe("src");
    },
    TIMEOUT,
  );
});
