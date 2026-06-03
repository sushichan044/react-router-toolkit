import { mkdtempDisposable } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { basename } from "pathe";
import { describe, expect, it as baseIt } from "vite-plus/test";

import { loadReactRouterConfig } from "../src/index";
import { fixtureRoot } from "./fixture";
import { makeTempDir } from "./utils";

const it = baseIt.extend<{ cacheDir: string }>({
  cacheDir: async ({}, use) => {
    await using cacheDir = await makeTempDir(import.meta.filename);
    await use(cacheDir.path);
  },
});

describe("loadReactRouterConfig", () => {
  it("returns null when the project has no react-router.config file", async ({ cacheDir }) => {
    expect(await loadReactRouterConfig(fixtureRoot("minimal"), { cacheDir })).toBeNull();
  });

  it("evaluates react-router.config.ts and returns its raw default export", async ({
    cacheDir,
  }) => {
    const loaded = await loadReactRouterConfig(fixtureRoot("custom-app-dir"), { cacheDir });

    expect(loaded).not.toBeNull();
    expect(isAbsolute(loaded!.configFile)).toBe(true);
    expect(loaded!.configFile.endsWith("react-router.config.ts")).toBe(true);
    expect(loaded!.config.appDirectory).toBe("src");
  });
});
