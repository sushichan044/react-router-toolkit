import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Settings } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import { makeTempDir } from "../../test/utils";
import { reactRouterToolkitSettings } from "../setup";
import noUnknownRouteExports from "./no-unknown-route-exports";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

// Reuse the "valid" fixture which has home.tsx and about.tsx registered as route modules.
const FIXTURE = "valid";

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

describe("no-unknown-route-exports", () => {
  // -------------------------------------------------------------------------
  // Valid: recognized React Router exports
  // -------------------------------------------------------------------------

  it("does not report recognized route exports (loader, action, meta, default)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `
export async function loader() { return null; }
export async function action() { return null; }
export function meta() { return []; }
export default function Home() { return null; }
`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report all recognized route exports", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `
export function loader() { return null; }
export function clientLoader() { return null; }
export function action() { return null; }
export function clientAction() { return null; }
export function ErrorBoundary() { return null; }
export function HydrateFallback() { return null; }
export function headers() { return {}; }
export function handle() { return {}; }
export function links() { return []; }
export function meta() { return []; }
export function shouldRevalidate() { return true; }
export function middleware() {}
export function clientMiddleware() {}
export default function Home() { return null; }
`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Invalid: unknown export names (typos and unknown names)
  // -------------------------------------------------------------------------

  it("reports a typo in loader export name", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [],
        invalid: [
          {
            code: `export const loadre = async () => null;`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports an unknown function export", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [],
        invalid: [
          {
            code: `export function handler() {}`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports unknown names exported through destructuring patterns", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [],
        invalid: [
          {
            code: `export const { loadre } = helpers;`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
          {
            code: `export const [sharedConfig] = values;`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
          {
            // Default value: the bound name lives in the AssignmentPattern's `left`.
            code: `export const { loadre = 1 } = helpers;`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
          {
            // Rest element: the bound name lives in the RestElement's `argument`.
            code: `export const [...rest] = values;`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Valid: type-only exports are never reported
  // -------------------------------------------------------------------------

  it("does not report export type alias declaration", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `export type ShopContext = { shopId: string };`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report export interface declaration", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `export interface Foo { bar: string; }`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report export { type Foo } specifier", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `
type Foo = { x: number };
export { type Foo };
`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Valid: re-export specifier using a recognized name
  // -------------------------------------------------------------------------

  it("does not report export { something as loader } — recognized exported name", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `
const internalLoader = async () => null;
export { internalLoader as loader };
`,
            filename: appFile("home.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Invalid: re-export specifier with an unknown name
  // -------------------------------------------------------------------------

  it("reports export { internalHelper } — unknown exported name", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [],
        invalid: [
          {
            code: `
const internalHelper = () => {};
export { internalHelper };
`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // allowedExports option
  // -------------------------------------------------------------------------

  it("does not report exports listed in allowedExports option", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `export const sharedConfig = { key: "value" };`,
            filename: appFile("home.tsx"),
            settings,
            options: [{ allowedExports: ["sharedConfig"] }],
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports export not covered by allowedExports option", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [],
        invalid: [
          {
            code: `export const sharedConfig = { key: "value" };`,
            filename: appFile("home.tsx"),
            settings,
            options: [{ allowedExports: ["otherName"] }],
            errors: [{ messageId: "unknownRouteExport" }],
          },
        ],
      });
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Non-route files: no reports
  // -------------------------------------------------------------------------

  it("does not report anything for files that are not route modules", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            // `not-a-route.tsx` is not in the routes.ts manifest, so it is not a route module.
            code: `export const loadre = async () => null;`,
            filename: appFile("not-a-route.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report anything when settings are absent", () => {
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            code: `export const loadre = async () => null;`,
            filename: appFile("home.tsx"),
            settings: {},
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("allows the Layout export on the root route module but not on other routes", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("no-unknown-route-exports", noUnknownRouteExports, {
        valid: [
          {
            // React Router honors `Layout` only on the root route.
            code: `
export function Layout({ children }: { children: React.ReactNode }) { return children; }
export default function Root() { return null; }
`,
            filename: appFile("root.tsx"),
            settings,
          },
        ],
        invalid: [
          {
            code: `
export function Layout({ children }: { children: React.ReactNode }) { return children; }
export default function Home() { return null; }
`,
            filename: appFile("home.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteExport" }],
          },
        ],
      });
    }).not.toThrow();
  });
});
