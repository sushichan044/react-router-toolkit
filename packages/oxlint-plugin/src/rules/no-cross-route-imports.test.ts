import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Settings } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import { makeTempDir } from "../../test/utils";
import { SETTINGS_KEY } from "../settings";
import { reactRouterToolkitSettings } from "../setup";
import noCrossRouteImports from "./no-cross-route-imports";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

const FIXTURE = "cross-route-imports";

function fixtureRoot(): string {
  return fileURLToPath(new URL(`../../test/fixtures/${FIXTURE}`, import.meta.url));
}

function appFile(relative: string): string {
  return join(fixtureRoot(), "app", relative);
}

async function fixtureSettings(): Promise<Settings> {
  await using cacheDir = await makeTempDir(import.meta.filename);
  const settings = await reactRouterToolkitSettings({
    root: fixtureRoot(),
    cacheDir: cacheDir.path,
  });
  return settings as unknown as Settings;
}

async function fixtureSettingsWithBareAtAlias(): Promise<Settings> {
  const settings = (await fixtureSettings()) as Record<string, unknown>;
  const toolkit = settings[SETTINGS_KEY] as {
    importAliases: { alias: string; targets: string[] }[];
  };
  toolkit.importAliases = [{ alias: "@", targets: [`${join(fixtureRoot(), "app")}/`] }];
  return settings as Settings;
}

describe("no-cross-route-imports", () => {
  // ---------------------------------------------------------------------------
  // Invalid: relative import targeting another route module
  // ---------------------------------------------------------------------------

  it("reports a relative import of another route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `import { something } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports a relative import of another route module without extension", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `import { something } from "./about";`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Invalid: alias import targeting another route module
  // ---------------------------------------------------------------------------

  it("reports an alias import of another route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `import { something } from "~/about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports an alias import of another route module without extension", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `import { something } from "~/about";`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Invalid: re-export from another route module
  // ---------------------------------------------------------------------------

  it("reports export { x } from another route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `export { something } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports export * from another route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `export * from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Invalid: import { type X, value } mixed import — value part makes it invalid
  // ---------------------------------------------------------------------------

  it("reports a mixed import with both type and value specifiers", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `import { type SomeType, someValue } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Invalid: import type disabled via allowTypeImports: false
  // ---------------------------------------------------------------------------

  it("reports import type when allowTypeImports is false", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `import type { SomeType } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
            options: [{ allowTypeImports: false }],
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports export type from another route module when allowTypeImports is false", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [],
        invalid: [
          {
            code: `export type { SomeType } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
            options: [{ allowTypeImports: false }],
            errors: [{ messageId: "crossRouteImport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Valid: import type allowed by default (allowTypeImports: true)
  // ---------------------------------------------------------------------------

  it("does not report import type when allowTypeImports is true (default)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            code: `import type { SomeType } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report export type from another route module when allowTypeImports is true", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            code: `export type { SomeType } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report when all specifiers are type-only", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            code: `import { type SomeType, type AnotherType } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Valid: importing from a shared module outside routes
  // ---------------------------------------------------------------------------

  it("does not report an import from a shared module (not a route file)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            code: `import { sharedValue } from "./shared";`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not expand a bare alias when the specifier continues without a path separator", async () => {
    const settings = await fixtureSettingsWithBareAtAlias();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            code: `import { something } from "@about";`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Valid: importing a co-located non-route file
  // ---------------------------------------------------------------------------

  it("does not report an import of a co-located component (not a route module)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            code: `import { SharedComponent } from "./_components/shared-component";`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Valid: importing from a non-route file (rule is a no-op)
  // ---------------------------------------------------------------------------

  it("does not report anything when the file is not a route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            // shared.ts is not registered as a route module, so the rule skips it.
            code: `import { something } from "./about.tsx";`,
            filename: appFile("shared.ts"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Valid: no settings configured
  // ---------------------------------------------------------------------------

  it("does not report anything when settings are absent", () => {
    expect(() => {
      ruleTester.run("no-cross-route-imports", noCrossRouteImports, {
        valid: [
          {
            code: `import { something } from "./about.tsx";`,
            filename: appFile("home.tsx"),
            settings: {},
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});
