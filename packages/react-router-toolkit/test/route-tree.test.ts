import { describe, expect, it } from "vite-plus/test";

import type { RouteConfigEntry } from "../src/index";
import { flattenRouteTree, RouteLayoutConflictError } from "../src/index";

describe("flattenRouteTree", () => {
  it("maps top-level index and path routes to their URLs with no layouts", () => {
    const routes: RouteConfigEntry[] = [
      { file: "home.tsx", index: true },
      { file: "about.tsx", path: "about" },
    ];

    expect(flattenRouteTree(routes)).toStrictEqual({
      "/": { file: "home.tsx", layouts: [] },
      "/about": { file: "about.tsx", layouts: [] },
    });
  });

  it("includes pathless layout files in the layout chain without giving them a URL", () => {
    const routes: RouteConfigEntry[] = [
      { file: "auth-layout.tsx", children: [{ file: "settings.tsx", path: "settings" }] },
    ];

    expect(flattenRouteTree(routes)).toStrictEqual({
      "/settings": { file: "settings.tsx", layouts: ["auth-layout.tsx"] },
    });
  });

  it("folds a path route with an index child into the layout chain, with the index as the page", () => {
    const routes: RouteConfigEntry[] = [
      {
        file: "auth-layout.tsx",
        children: [
          {
            file: "dashboard.tsx",
            path: "dashboard",
            children: [
              { file: "dashboard-home.tsx", index: true },
              { file: "settings.tsx", path: "settings" },
            ],
          },
        ],
      },
    ];

    expect(flattenRouteTree(routes)).toStrictEqual({
      "/dashboard": {
        file: "dashboard-home.tsx",
        layouts: ["auth-layout.tsx", "dashboard.tsx"],
      },
      "/dashboard/settings": {
        file: "settings.tsx",
        layouts: ["auth-layout.tsx", "dashboard.tsx"],
      },
    });
  });

  it("keeps the parent file as the page when a path route has children but no index", () => {
    const routes: RouteConfigEntry[] = [
      {
        file: "dashboard.tsx",
        path: "dashboard",
        children: [{ file: "settings.tsx", path: "settings" }],
      },
    ];

    expect(flattenRouteTree(routes)).toStrictEqual({
      "/dashboard": { file: "dashboard.tsx", layouts: [] },
      "/dashboard/settings": { file: "settings.tsx", layouts: ["dashboard.tsx"] },
    });
  });

  it("joins nested prefixes into full URLs", () => {
    const routes: RouteConfigEntry[] = [
      {
        file: "concerts-layout.tsx",
        path: "concerts",
        children: [
          { file: "concerts-index.tsx", index: true },
          { file: "trending.tsx", path: "trending" },
          { file: "city.tsx", path: ":city" },
        ],
      },
    ];

    expect(flattenRouteTree(routes)).toStrictEqual({
      "/concerts": { file: "concerts-index.tsx", layouts: ["concerts-layout.tsx"] },
      "/concerts/trending": { file: "trending.tsx", layouts: ["concerts-layout.tsx"] },
      "/concerts/:city": { file: "city.tsx", layouts: ["concerts-layout.tsx"] },
    });
  });

  it("keeps splat segments verbatim in the URL", () => {
    const routes: RouteConfigEntry[] = [{ file: "files.tsx", path: "files/*" }];

    expect(flattenRouteTree(routes)).toStrictEqual({
      "/files/*": { file: "files.tsx", layouts: [] },
    });
  });

  it("throws RouteLayoutConflictError when two path routes resolve to the same URL", () => {
    const routes: RouteConfigEntry[] = [
      { file: "a.tsx", path: "x" },
      { file: "b.tsx", path: "x" },
    ];

    expect(() => flattenRouteTree(routes)).toThrow(RouteLayoutConflictError);
  });
});
