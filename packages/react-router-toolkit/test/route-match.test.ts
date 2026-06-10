import { create } from "@platformatic/vfs";
import { describe, expect, it } from "vite-plus/test";

import type { RouteConfigEntry } from "../src/index";
import { findMissingRouteFiles, matchRoute } from "../src/index";
import { appDir } from "./fixture";

describe("matchRoute", () => {
  it("returns null when no route matches the pathname", () => {
    const routes: RouteConfigEntry[] = [{ file: "about.tsx", path: "about" }];

    expect(matchRoute(routes, "/missing")).toBeNull();
  });

  it("matches a top-level index route at /", () => {
    const routes: RouteConfigEntry[] = [{ file: "home.tsx", index: true }];

    expect(matchRoute(routes, "/")).toStrictEqual({
      pattern: "/",
      file: "home.tsx",
      layouts: [],
      params: {},
    });
  });

  it("matches a dynamic segment and extracts the param value", () => {
    const routes: RouteConfigEntry[] = [{ file: "city.tsx", path: "concerts/:city" }];

    expect(matchRoute(routes, "/concerts/tokyo")).toStrictEqual({
      pattern: "/concerts/:city",
      file: "city.tsx",
      layouts: [],
      params: { city: "tokyo" },
    });
  });

  it("matches an optional segment both with and without the optional part", () => {
    const routes: RouteConfigEntry[] = [{ file: "user.tsx", path: "users/:id/edit?" }];

    expect(matchRoute(routes, "/users/1")?.file).toBe("user.tsx");
    expect(matchRoute(routes, "/users/1/edit")?.file).toBe("user.tsx");
  });

  it("matches a splat route, capturing the rest of the pathname as params['*']", () => {
    const routes: RouteConfigEntry[] = [{ file: "files.tsx", path: "files/*" }];

    expect(matchRoute(routes, "/files/docs/intro.md")).toStrictEqual({
      pattern: "/files/*",
      file: "files.tsx",
      layouts: [],
      params: { "*": "docs/intro.md" },
    });
  });

  it("puts a pathless layout in layouts without contributing a pattern segment", () => {
    const routes: RouteConfigEntry[] = [
      { file: "auth-layout.tsx", children: [{ file: "settings.tsx", path: "settings" }] },
    ];

    expect(matchRoute(routes, "/settings")).toStrictEqual({
      pattern: "/settings",
      file: "settings.tsx",
      layouts: ["auth-layout.tsx"],
      params: {},
    });
  });

  it("returns the index child as the page at the parent's URL, with the parent as a layout", () => {
    const routes: RouteConfigEntry[] = [
      {
        file: "dashboard.tsx",
        path: "dashboard",
        children: [{ file: "dashboard-home.tsx", index: true }],
      },
    ];

    expect(matchRoute(routes, "/dashboard")).toStrictEqual({
      pattern: "/dashboard",
      file: "dashboard-home.tsx",
      layouts: ["dashboard.tsx"],
      params: {},
    });
  });

  it("orders layouts outermost to innermost across two nesting levels", () => {
    const routes: RouteConfigEntry[] = [
      {
        file: "outer-layout.tsx",
        children: [
          {
            file: "reserve-layout.tsx",
            path: "reserve",
            children: [{ file: "customer.tsx", path: "customers/:id" }],
          },
        ],
      },
    ];

    expect(matchRoute(routes, "/reserve/customers/c1")).toStrictEqual({
      pattern: "/reserve/customers/:id",
      file: "customer.tsx",
      layouts: ["outer-layout.tsx", "reserve-layout.tsx"],
      params: { id: "c1" },
    });
  });

  it("does not match a differently-cased pathname when the route is caseSensitive", () => {
    const routes: RouteConfigEntry[] = [{ file: "about.tsx", path: "About", caseSensitive: true }];

    expect(matchRoute(routes, "/about")).toBeNull();
    expect(matchRoute(routes, "/About")?.file).toBe("about.tsx");
  });

  it("returns the higher-ranked route when two routes match the same pathname", () => {
    const routes: RouteConfigEntry[] = [
      { file: "param.tsx", path: "items/:id" },
      { file: "static.tsx", path: "items/new" },
    ];

    expect(matchRoute(routes, "/items/new")?.file).toBe("static.tsx");
  });

  it("matches a trailing-slash pathname the same as its non-slash form", () => {
    const routes: RouteConfigEntry[] = [{ file: "about.tsx", path: "about" }];

    expect(matchRoute(routes, "/about/")?.file).toBe("about.tsx");
  });
});

describe("findMissingRouteFiles", () => {
  it("returns an empty array when every route file exists", async () => {
    const routes: RouteConfigEntry[] = [{ file: "root.tsx", path: "root" }];

    expect(await findMissingRouteFiles(routes, appDir("minimal"))).toStrictEqual([]);
  });

  it("returns only the files that are absent, sorted", async () => {
    const files = create({ moduleHooks: false });
    files.writeFileSync("/home.tsx", "export default () => null;\n");
    const routes: RouteConfigEntry[] = [
      { file: "home.tsx", index: true },
      { file: "z-missing.tsx", path: "z" },
      { file: "a-missing.tsx", path: "a" },
    ];

    expect(await findMissingRouteFiles(routes, "/app", files)).toStrictEqual([
      "a-missing.tsx",
      "z-missing.tsx",
    ]);
  });

  it("includes layout-only files reachable through nested children in the check", async () => {
    const files = create({ moduleHooks: false });
    files.writeFileSync("/settings.tsx", "export default () => null;\n");
    const routes: RouteConfigEntry[] = [
      { file: "auth-layout.tsx", children: [{ file: "settings.tsx", path: "settings" }] },
    ];

    expect(await findMissingRouteFiles(routes, "/app", files)).toStrictEqual(["auth-layout.tsx"]);
  });

  it("reports a file shared by multiple routes only once", async () => {
    const files = create({ moduleHooks: false });
    const routes: RouteConfigEntry[] = [
      { file: "shared.tsx", path: "a", id: "a" },
      { file: "shared.tsx", path: "b", id: "b" },
    ];

    expect(await findMissingRouteFiles(routes, "/app", files)).toStrictEqual(["shared.tsx"]);
  });
});
