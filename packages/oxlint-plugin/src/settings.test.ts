import { describe, expect, it } from "vite-plus/test";

import { readSettings, SETTINGS_KEY } from "./settings";

const VALID = {
  appDirectory: "/project/app",
  routes: {
    root: { id: "root", file: "root.tsx" },
    "routes/home": { id: "routes/home", file: "home.tsx", index: true },
  },
};

describe("readSettings", () => {
  it("returns null when the plugin's settings key is absent", () => {
    expect(readSettings({})).toBeNull();
    expect(readSettings({ react: { version: "detect" } })).toBeNull();
  });

  it("returns the validated config when the key is present", () => {
    const parsed = readSettings({ [SETTINGS_KEY]: VALID });

    expect(parsed?.appDirectory).toBe("/project/app");
    expect(parsed?.routes["routes/home"]?.file).toBe("home.tsx");
  });

  it("preserves unknown resolved-config fields for future rules", () => {
    const parsed = readSettings({ [SETTINGS_KEY]: { ...VALID, basename: "/", ssr: true } });

    expect(parsed).toMatchObject({ basename: "/", ssr: true });
  });

  it("throws when the resolved config is malformed", () => {
    expect(() => readSettings({ [SETTINGS_KEY]: { routes: {} } })).toThrow();
    expect(() =>
      readSettings({ [SETTINGS_KEY]: { appDirectory: "/app", routes: "nope" } }),
    ).toThrow();
  });
});
