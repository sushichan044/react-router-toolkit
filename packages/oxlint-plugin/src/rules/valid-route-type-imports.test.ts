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

  it("reports route type imports from non-generated modules", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [],
        invalid: [
          {
            code: `import type { Route } from "../shared/react-router-types";
import type { NearestOutletContext } from "../shared/toolkit-types";

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

  it("ignores unrelated generated type imports", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [
          {
            code: `import type { OtherRouteType } from "./+types/other";
import type { OtherToolkitType } from "./+toolkit-types/other";

export function helper(route: OtherRouteType, toolkit: OtherToolkitType) {
  return { route, toolkit };
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

  it("reports handwrittenRouteType for LoaderFunctionArgs imported from react-router in a route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [],
        invalid: [
          {
            code: `import type { LoaderFunctionArgs } from 'react-router';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return null;
};
`,
            filename: appFile("child.tsx"),
            settings,
            errors: [{ messageId: "handwrittenRouteType" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports handwrittenRouteType for namespace imports from react-router", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [],
        invalid: [
          {
            code: `import type * as RR from 'react-router';

export const loader = async ({ request }: RR.LoaderFunctionArgs) => {
  return null;
};
`,
            filename: appFile("child.tsx"),
            settings,
            errors: [{ messageId: "handwrittenRouteType" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports handwrittenRouteType for react-router-dom imports", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [],
        invalid: [
          {
            code: `import type { LoaderFunctionArgs } from 'react-router-dom';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return null;
};
`,
            filename: appFile("child.tsx"),
            settings,
            errors: [{ messageId: "handwrittenRouteType" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("reports handwrittenRouteType for ActionFunctionArgs and MetaFunction in a route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [],
        invalid: [
          {
            code: `import type { ActionFunctionArgs, MetaFunction } from 'react-router';

export const action = async ({ request }: ActionFunctionArgs) => {
  return null;
};

export const meta: MetaFunction = () => [];
`,
            filename: appFile("child.tsx"),
            settings,
            errors: [{ messageId: "handwrittenRouteType" }, { messageId: "handwrittenRouteType" }],
          },
        ],
      });
    }).not.toThrow();
  });

  it("does not report for non-type imports like redirect from react-router in a route module", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [
          {
            code: `import { redirect } from 'react-router';

export const loader = async () => {
  return redirect('/');
};
`,
            filename: appFile("child.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report for types not in the replacement map (e.g. ShouldRevalidateFunction)", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [
          {
            code: `import type { ShouldRevalidateFunction } from 'react-router';

export const shouldRevalidate: ShouldRevalidateFunction = () => false;
`,
            filename: appFile("child.tsx"),
            settings,
          },
        ],
        invalid: [],
      });
    }).not.toThrow();
  });

  it("does not report LoaderFunctionArgs imported in a non-route module file", async () => {
    const settings = await fixtureSettings();
    expect(() => {
      ruleTester.run("valid-route-type-imports", validRouteTypeImports, {
        valid: [
          {
            code: `import type { LoaderFunctionArgs } from 'react-router';

export function createLoader(fn: (args: LoaderFunctionArgs) => unknown) {
  return fn;
}
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
