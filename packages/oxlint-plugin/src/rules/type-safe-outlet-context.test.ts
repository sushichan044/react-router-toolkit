import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Settings } from "@oxlint/plugins";
import { RuleTester } from "oxlint/plugins-dev";
import { describe, expect, it } from "vite-plus/test";

import { makeTempDir } from "../../test/utils";
import { reactRouterToolkitSettings } from "../setup";
import typeSafeOutletContext from "./type-safe-outlet-context";

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

const VALID_LAYOUT = `import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

export default function Layout() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}
`;

describe("type-safe-outlet-context", () => {
  describe("child route (useOutletContext)", () => {
    it("inserts the parent's context type and its import when the call is bare", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { useOutletContext } from "react-router";

export default function Child() {
  const context = useOutletContext();
  return context;
}
`,
              filename: appFile("child.tsx"),
              settings,
              errors: [{ messageId: "missingOutletContextType" }],
              output: `import { useOutletContext } from "react-router";
import type { ShopContext } from "./layout";

export default function Child() {
  const context = useOutletContext<ShopContext>();
  return context;
}
`,
            },
          ],
        });
      }).not.toThrow();
    });

    it("replaces a wrong existing type argument", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { useOutletContext } from "react-router";

export default function ChildWrong() {
  const context = useOutletContext<number>();
  return context;
}
`,
              filename: appFile("child-wrong.tsx"),
              settings,
              errors: [{ messageId: "outdatedOutletContextType" }],
              output: `import { useOutletContext } from "react-router";
import type { ShopContext } from "./layout";

export default function ChildWrong() {
  const context = useOutletContext<ShopContext>();
  return context;
}
`,
            },
          ],
        });
      }).not.toThrow();
    });

    it("does not report when the type argument already matches", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [
            {
              code: `import { useOutletContext } from "react-router";
import type { ShopContext } from "./layout";

export default function Child() {
  const context = useOutletContext<ShopContext>();
  return context;
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

    it("reports misuse when the immediate parent renders <Outlet> without context", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { useOutletContext } from "react-router";

export default function Other() {
  const context = useOutletContext();
  return context;
}
`,
              filename: appFile("other.tsx"),
              settings,
              errors: [{ messageId: "parentOutletPassesNoContext" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("does not inherit a grandparent's context through a bare <Outlet> parent", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              // grandchild's immediate parent is `middle-no-context.tsx` (bare <Outlet>), even though
              // its grandparent `layout.tsx` passes ShopContext. The context is undefined here, so we
              // must report misuse and never fill in ShopContext.
              code: `import { useOutletContext } from "react-router";

export default function Grandchild() {
  const context = useOutletContext();
  return context;
}
`,
              filename: appFile("grandchild.tsx"),
              settings,
              errors: [{ messageId: "parentOutletPassesNoContext" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("skips files that are not route modules", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [
            {
              code: `import { useOutletContext } from "react-router";

export default function Plain() {
  return useOutletContext();
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

    it("does not infer when the parent's outlet is in an exported component", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [
            {
              code: `import { useOutletContext } from "react-router";

export default function ChildExportedComponent() {
  const context = useOutletContext();
  return context;
}
`,
              filename: appFile("child-exported-component.tsx"),
              settings,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });

    it("infers from a parent whose outlet is in a non-exported local component", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { useOutletContext } from "react-router";

export default function ChildLocalComponent() {
  const context = useOutletContext();
  return context;
}
`,
              filename: appFile("child-local-component.tsx"),
              settings,
              errors: [{ messageId: "missingOutletContextType" }],
              output: `import { useOutletContext } from "react-router";
import type { ShopContext } from "./layout-local-component";

export default function ChildLocalComponent() {
  const context = useOutletContext<ShopContext>();
  return context;
}
`,
            },
          ],
        });
      }).not.toThrow();
    });

    it("does not infer when the parent's outlet is in an unreachable local component", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [
            {
              code: `import { useOutletContext } from "react-router";

export default function ChildUnreachableLocal() {
  const context = useOutletContext();
  return context;
}
`,
              filename: appFile("child-unreachable-local.tsx"),
              settings,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });
  });

  describe("parent route (<Outlet context>)", () => {
    it("accepts context annotated with a local exported type via satisfies", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [{ code: VALID_LAYOUT, filename: appFile("layout.tsx"), settings }],
          invalid: [],
        });
      }).not.toThrow();
    });

    it("rejects `as` (must use `satisfies`) without auto-fixing", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

export default function Layout() {
  return <Outlet context={{ shopId: "shop_1" } as ShopContext} />;
}
`,
              filename: appFile("layout.tsx"),
              settings,
              errors: [{ messageId: "useSatisfiesNotAs" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("rejects an inline context type", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { Outlet } from "react-router";

export default function Layout() {
  return <Outlet context={{ shopId: "shop_1" } satisfies { shopId: string }} />;
}
`,
              filename: appFile("layout.tsx"),
              settings,
              errors: [{ messageId: "inlineOutletContextType" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("rejects spread attributes on <Outlet>", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

const outletProps = { context: { shopId: "shop_1" } satisfies ShopContext };

export default function Layout() {
  return <Outlet {...outletProps} />;
}
`,
              filename: appFile("layout.tsx"),
              settings,
              errors: [{ messageId: "outletSpreadAttribute" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("rejects context passed without a type annotation", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { Outlet } from "react-router";

export default function Layout() {
  return <Outlet context={{ shopId: "shop_1" }} />;
}
`,
              filename: appFile("layout.tsx"),
              settings,
              errors: [{ messageId: "missingOutletContextAnnotation" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("requires the context type to be exported (no auto-fix)", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { Outlet } from "react-router";

type ShopContext = { shopId: string };

export default function Layout() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}
`,
              filename: appFile("layout.tsx"),
              settings,
              // Reported at the type alias declaration (line 3), where `export` must be added —
              // not at the `satisfies ShopContext` reference.
              errors: [{ messageId: "outletContextTypeNotExported", line: 3 }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("requires the context type to be a type alias declared in this module", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { Outlet } from "react-router";
import type { ShopContext } from "./shared";

export default function Layout() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}
`,
              filename: appFile("layout.tsx"),
              settings,
              errors: [{ messageId: "outletContextTypeNotLocal" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("reports an <Outlet> rendered from an exported component", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [],
          invalid: [
            {
              code: `import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

export function ExportedSection() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}

export default function LayoutExportedComponent() {
  return <div>no outlet here</div>;
}
`,
              filename: appFile("layout-exported-component.tsx"),
              settings,
              errors: [{ messageId: "outletInExportedComponent" }],
            },
          ],
        });
      }).not.toThrow();
    });

    it("accepts an <Outlet> rendered from a non-exported local component", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [
            {
              code: `import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

function Inner() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}

export default function LayoutLocalComponent() {
  return <Inner />;
}
`,
              filename: appFile("layout-local-component.tsx"),
              settings,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });

    it("ignores an <Outlet> in an unreachable local component", async () => {
      const settings = await fixtureSettings();
      expect(() => {
        ruleTester.run("type-safe-outlet-context", typeSafeOutletContext, {
          valid: [
            {
              code: `import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

function NeverUsed() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}

export default function LayoutUnreachableLocal() {
  return <div>no outlet here</div>;
}
`,
              filename: appFile("layout-unreachable-local.tsx"),
              settings,
            },
          ],
          invalid: [],
        });
      }).not.toThrow();
    });
  });
});
