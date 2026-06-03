import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it as baseIt } from "vite-plus/test";

import { makeTempDir } from "../test/utils";
import { reactRouterToolkitSettings, SETTINGS_KEY } from "./setup";

function fixtureRoot(fixture: string): string {
  return fileURLToPath(new URL(`../test/fixtures/${fixture}`, import.meta.url));
}

const it = baseIt.extend<{ cacheDir: string }>({
  cacheDir: async ({}, use) => {
    await using cacheDir = await makeTempDir(import.meta.filename);
    await use(cacheDir.path);
  },
});

describe("reactRouterToolkitSettings", () => {
  it("returns the resolved config keyed under the plugin's settings key", async ({ cacheDir }) => {
    const settings = await reactRouterToolkitSettings({
      root: fixtureRoot("valid"),
      cacheDir,
    });

    const resolved = settings[SETTINGS_KEY];
    expect(resolved.appDirectory).toBe(join(fixtureRoot("valid"), "app"));
    expect(Object.values(resolved.routes).map((entry) => entry.file)).toEqual(
      expect.arrayContaining(["root.tsx", "home.tsx", "about.tsx"]),
    );
  });

  it("returns a JSON-serializable object", async ({ cacheDir }) => {
    const settings = await reactRouterToolkitSettings({
      root: fixtureRoot("valid"),
      cacheDir,
    });

    expect(JSON.parse(JSON.stringify(settings))).toEqual(settings);
  });
});
