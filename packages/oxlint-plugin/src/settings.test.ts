import { describe, expect, it } from "vite-plus/test";

import { readSettings, SETTINGS_KEY } from "./settings";

const VALID = {
  root: "/project",
  // A complete JSON-safe resolved config, as produced by `reactRouterToolkitSettings`.
  resolvedSettings: {
    appDirectory: "/project/app",
    basename: "/",
    buildDirectory: "/project/build",
    future: {},
    routeDiscovery: { mode: "lazy", manifestPath: "/__manifest" },
    routes: {
      root: { id: "root", file: "root.tsx" },
      "routes/home": { id: "routes/home", file: "home.tsx", index: true },
    },
    serverBuildFile: "index.js",
    serverModuleFormat: "esm",
    ssr: true,
    subResourceIntegrity: false,
    allowedActionOrigins: false,
  },
};

describe("readSettings", () => {
  it("returns null when the plugin's settings key is absent", () => {
    expect(readSettings({})).toBeNull();
    expect(readSettings({ react: { version: "detect" } })).toBeNull();
  });

  it("returns the validated config when the key is present", () => {
    const parsed = readSettings({ [SETTINGS_KEY]: VALID });

    expect(parsed?.root).toBe("/project");
    expect(parsed?.resolvedSettings.appDirectory).toBe("/project/app");
    expect(parsed?.resolvedSettings.routes["routes/home"]?.file).toBe("home.tsx");
  });

  it("strips resolved-config fields the schema does not declare", () => {
    const parsed = readSettings({
      [SETTINGS_KEY]: {
        ...VALID,
        resolvedSettings: { ...VALID.resolvedSettings, prerender: true, unstable_routeConfig: [] },
      },
    });

    expect(parsed?.resolvedSettings).not.toHaveProperty("prerender");
    expect(parsed?.resolvedSettings.ssr).toBe(true);
  });

  it("throws when the resolved config is malformed", () => {
    expect(() =>
      readSettings({ [SETTINGS_KEY]: { resolvedSettings: VALID.resolvedSettings } }),
    ).toThrow();
    expect(() =>
      readSettings({ [SETTINGS_KEY]: { root: "/project", resolvedSettings: { routes: {} } } }),
    ).toThrow();
  });
});
