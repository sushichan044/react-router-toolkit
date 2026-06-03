import { describe, expect, it } from "vite-plus/test";

import { readSettings, SETTINGS_KEY } from "./settings";

const VALID = {
  root: "/project",
  resolvedSettings: {
    appDirectory: "/project/app",
    routes: {
      root: { id: "root", file: "root.tsx" },
      "routes/home": { id: "routes/home", file: "home.tsx", index: true },
    },
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

  it("preserves unknown resolved-config fields for future rules", () => {
    const parsed = readSettings({
      [SETTINGS_KEY]: {
        ...VALID,
        resolvedSettings: { ...VALID.resolvedSettings, basename: "/", ssr: true },
      },
    });

    expect(parsed?.resolvedSettings).toMatchObject({ basename: "/", ssr: true });
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
