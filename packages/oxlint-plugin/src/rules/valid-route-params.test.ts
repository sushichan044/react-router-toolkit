import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Settings } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import { makeTempDir } from "../../test/utils";
import { reactRouterToolkitSettings } from "../setup";
import validRouteParams from "./valid-route-params";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

// Re-use the no-unresolved-route-path fixture which has:
//   index("home.tsx")
//   route("about", "about.tsx")
//   route("shops", "shops.tsx", [route(":shop_id", "shop-detail.tsx")])
const FIXTURE = "no-unresolved-route-path";

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

// ---------------------------------------------------------------------------
// Destructuring patterns
// ---------------------------------------------------------------------------

describe("valid-route-params — destructuring", () => {
  it("allows destructuring an existing param on the route", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams } from "react-router";
const { shop_id } = useParams();`,
            filename: appFile("shop-detail.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports destructuring a param that does not exist on the route", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [],
        invalid: [
          {
            code: `import { useParams } from "react-router";
const { shopId } = useParams();`,
            filename: appFile("shop-detail.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteParam" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("allows rename destructuring ({ shop_id: id }) — the key is checked, not the local binding", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams } from "react-router";
const { shop_id: id } = useParams();`,
            filename: appFile("shop-detail.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports an unknown param even when destructuring with rename", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [],
        invalid: [
          {
            code: `import { useParams } from "react-router";
const { shopId: id } = useParams();`,
            filename: appFile("shop-detail.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteParam" }],
          },
        ],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Member access patterns
// ---------------------------------------------------------------------------

describe("valid-route-params — member access", () => {
  it("allows params.shop_id (existing param)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams } from "react-router";
const params = useParams();
const id = params.shop_id;`,
            filename: appFile("shop-detail.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("reports params.nope (unknown param)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [],
        invalid: [
          {
            code: `import { useParams } from "react-router";
const params = useParams();
const id = params.nope;`,
            filename: appFile("shop-detail.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteParam" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it('allows params["shop_id"] (computed string literal, existing param)', async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams } from "react-router";
const params = useParams();
const id = params["shop_id"];`,
            filename: appFile("shop-detail.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it('reports params["nope"] (computed string literal, unknown param)', async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [],
        invalid: [
          {
            code: `import { useParams } from "react-router";
const params = useParams();
const id = params["nope"];`,
            filename: appFile("shop-detail.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteParam" }],
          },
        ],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Ancestor params
// ---------------------------------------------------------------------------

describe("valid-route-params — ancestor params", () => {
  it("allows ancestor route params when accessed in a child route module", async () => {
    // shop-detail.tsx IS the :shop_id route, so shop_id is its own param.
    // If there were a deeper child, it would inherit shop_id.
    // Here we verify that shop_id is in scope at shop-detail.tsx level.
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams } from "react-router";
const { shop_id } = useParams();`,
            filename: appFile("shop-detail.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// No params on this route
// ---------------------------------------------------------------------------

describe("valid-route-params — paramless route", () => {
  it("reports any param access on a route with no params (available: none)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [],
        invalid: [
          {
            code: `import { useParams } from "react-router";
const { shop_id } = useParams();`,
            filename: appFile("shops.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteParam" }],
          },
        ],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Non-route files are not linted
// ---------------------------------------------------------------------------

describe("valid-route-params — non-route files", () => {
  it("does not report anything for files that are not registered route modules", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams } from "react-router";
const { shopId } = useParams();`,
            // not-a-route.tsx is not in routes.ts, so it should be skipped
            filename: appFile("not-a-route.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// react-router-dom import
// ---------------------------------------------------------------------------

describe("valid-route-params — react-router-dom import", () => {
  it("tracks useParams imported from react-router-dom", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [],
        invalid: [
          {
            code: `import { useParams } from "react-router-dom";
const { shopId } = useParams();`,
            filename: appFile("shop-detail.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteParam" }],
          },
        ],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Renamed import
// ---------------------------------------------------------------------------

describe("valid-route-params — renamed import", () => {
  it("tracks useParams under its renamed local binding", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [],
        invalid: [
          {
            code: `import { useParams as up } from "react-router";
const { shopId } = up();`,
            filename: appFile("shop-detail.tsx"),
            settings,
            errors: [{ messageId: "unknownRouteParam" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("allows valid param with renamed import", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams as up } from "react-router";
const { shop_id } = up();`,
            filename: appFile("shop-detail.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// No settings — no-op
// ---------------------------------------------------------------------------

describe("valid-route-params — no settings", () => {
  it("does not report anything when settings are absent", () => {
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            code: `import { useParams } from "react-router";
const { shopId } = useParams();`,
            filename: appFile("shop-detail.tsx"),
            settings: {},
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Type argument is not inspected
// ---------------------------------------------------------------------------

describe("valid-route-params — type arguments ignored", () => {
  it("does not report on useParams<{ shopId: string }> type argument", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-params", validRouteParams, {
        valid: [
          {
            // The type arg has shopId but the destructuring uses shop_id (valid).
            // This asserts the type arg itself does not trigger a report.
            code: `import { useParams } from "react-router";
const { shop_id } = useParams<{ shopId: string }>();`,
            filename: appFile("shop-detail.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });
});
