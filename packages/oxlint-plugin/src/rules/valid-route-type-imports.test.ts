import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Settings } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import { makeTempDir } from "../../test/utils";
import { reactRouterToolkitSettings } from "../setup";
import validRouteTypeImports from "./valid-route-type-imports";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

const FIXTURE = "outlet-context";

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

describe("valid-route-type-imports", () => {
  it("does not report when route type imports point at this route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [
          {
            code: `import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";

export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
`,
            filename: appFile("child.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("fixes generated type imports that point at another route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [],
        invalid: [
          {
            code: `import type { Route } from "./+types/other";
import type { NearestOutletContext } from "./+toolkit-types/other";

export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
`,
            filename: appFile("child.tsx"),
            settings,
            errors: [
              { messageId: "wrongReactRouterTypeImport" },
              { messageId: "wrongToolkitTypeImport" },
            ],
            output: `import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";

export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
`,
          },
        ],
      });
    }).not.toThrow();
  });

  it("inserts missing generated type imports when generated route types are referenced", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [],
        invalid: [
          {
            code: `export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
`,
            filename: appFile("child.tsx"),
            settings,
            errors: [
              { messageId: "missingReactRouterTypeImport" },
              { messageId: "missingToolkitTypeImport" },
            ],
            output: `import type { Route } from "./+types/child";
import type { NearestOutletContext } from "./+toolkit-types/child";
export function loader({ params }: Route.LoaderArgs) {
  return params;
}

export default function Child() {
  const context: NearestOutletContext = { shopId: "shop_1" };
  return context.shopId;
}
`,
          },
        ],
      });
    }).not.toThrow();
  });

  it("skips files that are not route modules", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [
          {
            code: `import type { Route } from "./+types/other";

export function helper(_args: Route.LoaderArgs) {}
`,
            filename: appFile("not-a-route.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});
