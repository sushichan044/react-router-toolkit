import { create } from "@platformatic/vfs";
import { describe, expect, it } from "vite-plus/test";

import type { OutletInfo, RouteModuleExports, RouteModuleInfo } from "../src/schemas";
import {
  classifyModuleOutletContext,
  computeTypegenTargets,
  resolveParentOutletContext,
  toolkitTypesSpecifier,
} from "../src/typegen/compute";
import type { TypegenTarget } from "../src/typegen/compute";
import { writeTypegenFiles } from "../src/typegen/write";

const ROOT = "/proj";

const NO_EXPORTS: RouteModuleExports = {
  default: null,
  ErrorBoundary: null,
  HydrateFallback: null,
  loader: null,
  clientLoader: null,
  action: null,
  clientAction: null,
  middleware: null,
  clientMiddleware: null,
  headers: null,
  links: null,
  meta: null,
  handle: null,
  shouldRevalidate: null,
};

const SPAN = { start: 0, end: 0 };

function routeModule(
  id: string,
  file: string,
  overrides?: Partial<Pick<RouteModuleInfo, "parentId" | "outlets">>,
): RouteModuleInfo {
  return {
    id,
    file,
    physicalFile: `${ROOT}/app/${file}`,
    outlets: [],
    exports: NO_EXPORTS,
    unknownExports: [],
    ...overrides,
  };
}

function bareOutlet(): OutletInfo {
  return { span: SPAN, passesContext: false, hasSpread: false, annotation: null };
}

function typedOutlet(name: string, options?: { exported?: boolean }): OutletInfo {
  return {
    span: SPAN,
    passesContext: true,
    hasSpread: false,
    annotation: {
      operator: "satisfies",
      type: {
        text: name,
        span: SPAN,
        localTypeAlias: { exported: options?.exported ?? true, span: SPAN },
      },
    },
  };
}

function untypedOutlet(): OutletInfo {
  return { span: SPAN, passesContext: true, hasSpread: false, annotation: null };
}

describe("resolveParentOutletContext", () => {
  it("resolves a single exported type passed by every outlet", async () => {
    const parent = routeModule("layout", "routes/layout.tsx", {
      outlets: [typedOutlet("ShopContext"), typedOutlet("ShopContext")],
    });

    expect(resolveParentOutletContext(parent)).toEqual({ kind: "type", name: "ShopContext" });
  });

  it("reports none when the parent renders no outlet", async () => {
    expect(resolveParentOutletContext(routeModule("layout", "routes/layout.tsx"))).toEqual({
      kind: "none",
    });
  });

  it("reports bare when every outlet passes no context", async () => {
    const parent = routeModule("layout", "routes/layout.tsx", {
      outlets: [bareOutlet(), bareOutlet()],
    });

    expect(resolveParentOutletContext(parent)).toEqual({ kind: "bare" });
  });

  it("reports untyped when context is passed without a usable named type", async () => {
    const parent = routeModule("layout", "routes/layout.tsx", {
      outlets: [untypedOutlet()],
    });

    expect(resolveParentOutletContext(parent)).toEqual({ kind: "untyped" });
  });

  it("reports untyped when the only named type is not exported", async () => {
    const parent = routeModule("layout", "routes/layout.tsx", {
      outlets: [typedOutlet("ShopContext", { exported: false })],
    });

    expect(resolveParentOutletContext(parent)).toEqual({ kind: "untyped" });
  });

  it("reports ambiguous when outlets pass different exported types", async () => {
    const parent = routeModule("layout", "routes/layout.tsx", {
      outlets: [typedOutlet("AContext"), typedOutlet("BContext")],
    });

    expect(resolveParentOutletContext(parent)).toEqual({ kind: "ambiguous" });
  });

  it("reports ambiguous when only some outlets pass the exported type", async () => {
    const parent = routeModule("layout", "routes/layout.tsx", {
      outlets: [typedOutlet("ShopContext"), bareOutlet()],
    });

    expect(resolveParentOutletContext(parent)).toEqual({ kind: "ambiguous" });
  });
});

describe("classifyModuleOutletContext", () => {
  const typedLayout = routeModule("typed-layout", "routes/typed-layout.tsx", {
    outlets: [typedOutlet("ShopContext")],
  });
  const bareLayout = routeModule("bare-layout", "routes/bare-layout.tsx", {
    outlets: [bareOutlet()],
  });
  const untypedLayout = routeModule("untyped-layout", "routes/untyped-layout.tsx", {
    outlets: [untypedOutlet()],
  });
  const ambiguousLayout = routeModule("ambiguous-layout", "routes/ambiguous-layout.tsx", {
    outlets: [typedOutlet("AContext"), typedOutlet("BContext")],
  });
  const routeModules = {
    "typed-layout": typedLayout,
    "bare-layout": bareLayout,
    "untyped-layout": untypedLayout,
    "ambiguous-layout": ambiguousLayout,
  };
  const under = (id: string, parentId: string | undefined) =>
    routeModule(id, "routes/shared.tsx", parentId === undefined ? {} : { parentId });

  it("classifies a mix of typed and bare registrations as typed (the union is precise)", () => {
    const registrations = [under("a", "bare-layout"), under("b", "typed-layout")];

    expect(classifyModuleOutletContext(registrations, routeModules)).toBe("typed");
  });

  it("classifies as undefined when every registration receives nothing", () => {
    const registrations = [under("a", "bare-layout"), under("b", undefined)];

    expect(classifyModuleOutletContext(registrations, routeModules)).toBe("undefined");
  });

  it("classifies as ambiguous when any registration's parent is ambiguous", () => {
    const registrations = [under("a", "typed-layout"), under("b", "ambiguous-layout")];

    expect(classifyModuleOutletContext(registrations, routeModules)).toBe("ambiguous");
  });

  it("classifies as indeterminate when any registration is undeterminable", () => {
    const registrations = [under("a", "typed-layout"), under("b", "untyped-layout")];

    expect(classifyModuleOutletContext(registrations, routeModules)).toBe("indeterminate");
  });
});

function outputFileOf(route: string): string {
  return `.react-router-toolkit/types/app/routes/+toolkit-types/${route}.d.ts`;
}

function contentOf(targets: readonly TypegenTarget[], route: string): string | undefined {
  return targets.find((target) => target.outputFile === outputFileOf(route))?.expectedContent;
}

describe("computeTypegenTargets", () => {
  const layout = routeModule("layout", "routes/layout.tsx", {
    outlets: [typedOutlet("ShopContext")],
  });
  const child = routeModule("child", "routes/child.tsx", { parentId: "layout" });

  it("generates one target per route module file", async () => {
    const targets = computeTypegenTargets(ROOT, { layout, child });

    expect(targets.map((target) => target.outputFile).sort()).toEqual([
      outputFileOf("child"),
      outputFileOf("layout"),
    ]);
  });

  it("references the parent's exported type when its outlets pass a single exported type", async () => {
    const targets = computeTypegenTargets(ROOT, { layout, child });

    expect(contentOf(targets, "child")).toBe(
      "// Generated by `react-router-toolkit typegen`. Do not edit.\n" +
        'export type NearestOutletContext = import("../../../../../app/routes/layout.js").ShopContext;\n',
    );
  });

  it("declares undefined for a route without a parent", async () => {
    const targets = computeTypegenTargets(ROOT, { layout });

    expect(contentOf(targets, "layout")).toContain("export type NearestOutletContext = undefined;");
  });

  it("declares undefined when the parent only renders bare outlets", async () => {
    const bareLayout = routeModule("bare-layout", "routes/bare-layout.tsx", {
      outlets: [bareOutlet()],
    });
    const other = routeModule("other", "routes/other.tsx", { parentId: "bare-layout" });

    const targets = computeTypegenTargets(ROOT, { "bare-layout": bareLayout, other });

    expect(contentOf(targets, "other")).toContain("export type NearestOutletContext = undefined;");
  });

  it("declares unknown when the parent's context cannot be determined statically", async () => {
    const untypedLayout = routeModule("untyped-layout", "routes/untyped-layout.tsx", {
      outlets: [untypedOutlet()],
    });
    const ambiguousLayout = routeModule("ambiguous-layout", "routes/ambiguous-layout.tsx", {
      outlets: [typedOutlet("AContext"), typedOutlet("BContext")],
    });
    const noOutletLayout = routeModule("no-outlet-layout", "routes/no-outlet-layout.tsx");

    const targets = computeTypegenTargets(ROOT, {
      "untyped-layout": untypedLayout,
      "ambiguous-layout": ambiguousLayout,
      "no-outlet-layout": noOutletLayout,
      a: routeModule("a", "routes/a.tsx", { parentId: "untyped-layout" }),
      b: routeModule("b", "routes/b.tsx", { parentId: "ambiguous-layout" }),
      c: routeModule("c", "routes/c.tsx", { parentId: "no-outlet-layout" }),
    });

    for (const route of ["a", "b", "c"]) {
      expect(contentOf(targets, route)).toContain("export type NearestOutletContext = unknown;");
    }
  });

  it("unions the context types when one file serves multiple routes with different parents", async () => {
    const layoutA = routeModule("layout-a", "routes/layout-a.tsx", {
      outlets: [typedOutlet("AContext")],
    });
    const layoutB = routeModule("layout-b", "routes/layout-b.tsx", {
      outlets: [typedOutlet("BContext")],
    });
    const sharedA = routeModule("shared-a", "routes/shared.tsx", { parentId: "layout-a" });
    const sharedB = routeModule("shared-b", "routes/shared.tsx", { parentId: "layout-b" });

    const targets = computeTypegenTargets(ROOT, {
      "layout-a": layoutA,
      "layout-b": layoutB,
      "shared-a": sharedA,
      "shared-b": sharedB,
    });

    expect(targets.filter((t) => t.outputFile === outputFileOf("shared"))).toHaveLength(1);
    expect(contentOf(targets, "shared")).toContain(
      "export type NearestOutletContext = " +
        'import("../../../../../app/routes/layout-a.js").AContext | ' +
        'import("../../../../../app/routes/layout-b.js").BContext;',
    );
  });

  it("collapses the union to unknown when any contributing route is undeterminable", async () => {
    const layoutA = routeModule("layout-a", "routes/layout-a.tsx", {
      outlets: [typedOutlet("AContext")],
    });
    const untypedLayout = routeModule("untyped-layout", "routes/untyped-layout.tsx", {
      outlets: [untypedOutlet()],
    });
    const sharedA = routeModule("shared-a", "routes/shared.tsx", { parentId: "layout-a" });
    const sharedB = routeModule("shared-b", "routes/shared.tsx", { parentId: "untyped-layout" });

    const targets = computeTypegenTargets(ROOT, {
      "layout-a": layoutA,
      "untyped-layout": untypedLayout,
      "shared-a": sharedA,
      "shared-b": sharedB,
    });

    expect(contentOf(targets, "shared")).toContain("export type NearestOutletContext = unknown;");
  });
});

describe("toolkitTypesSpecifier", () => {
  it("builds the route-relative specifier from the route file basename", async () => {
    expect(toolkitTypesSpecifier("/proj/app/routes/shop.products.tsx")).toBe(
      "./+toolkit-types/shop.products",
    );
  });
});

describe("writeTypegenFiles", () => {
  const layout = routeModule("layout", "routes/layout.tsx", {
    outlets: [typedOutlet("ShopContext")],
  });
  const child = routeModule("child", "routes/child.tsx", { parentId: "layout" });

  const CHILD_OUTPUT = ".react-router-toolkit/types/app/routes/+toolkit-types/child.d.ts";
  const LAYOUT_OUTPUT = ".react-router-toolkit/types/app/routes/+toolkit-types/layout.d.ts";

  it("writes the generated files into the provided filesystem", async () => {
    const files = create({ moduleHooks: false });
    const targets = computeTypegenTargets(ROOT, { layout, child });

    const result = await writeTypegenFiles(targets, files);

    expect(result.written).toEqual([CHILD_OUTPUT, LAYOUT_OUTPUT]);
    expect(files.readFileSync(`/${CHILD_OUTPUT}`, { encoding: "utf8" })).toBe(
      contentOf(targets, "child"),
    );
    expect(files.readFileSync(`/${LAYOUT_OUTPUT}`, { encoding: "utf8" })).toBe(
      contentOf(targets, "layout"),
    );
  });

  it("rebuilds the typegen directory from scratch, dropping files without a target", async () => {
    const files = create({ moduleHooks: false });
    files.mkdirSync("/.react-router-toolkit/types/app/routes/gone/+toolkit-types", {
      recursive: true,
    });
    files.writeFileSync(
      "/.react-router-toolkit/types/app/routes/gone/+toolkit-types/old.d.ts",
      "// stale\n",
    );
    const targets = computeTypegenTargets(ROOT, { layout, child });

    const result = await writeTypegenFiles(targets, files);

    expect(result.written).toEqual([CHILD_OUTPUT, LAYOUT_OUTPUT]);
    expect(files.existsSync("/.react-router-toolkit/types/app/routes/gone")).toBe(false);
    expect(files.readFileSync(`/${CHILD_OUTPUT}`, { encoding: "utf8" })).toBe(
      contentOf(targets, "child"),
    );
  });

  it("is idempotent across consecutive runs", async () => {
    const files = create({ moduleHooks: false });
    const targets = computeTypegenTargets(ROOT, { layout, child });

    await writeTypegenFiles(targets, files);
    const second = await writeTypegenFiles(targets, files);

    expect(second.written).toEqual([CHILD_OUTPUT, LAYOUT_OUTPUT]);
    expect(files.readFileSync(`/${CHILD_OUTPUT}`, { encoding: "utf8" })).toBe(
      contentOf(targets, "child"),
    );
  });
});
