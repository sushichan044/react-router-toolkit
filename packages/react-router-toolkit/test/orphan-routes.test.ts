import { create } from "@platformatic/vfs";
import { describe, expect, it } from "vite-plus/test";

import type { RouteManifest } from "../src/index";
import { findOrphanRouteFiles } from "../src/index";

function makeVfs(files: Record<string, string>): ReturnType<typeof create> {
  const vfs = create({ moduleHooks: false });
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const dir = "/" + parts.slice(0, i).join("/");
      try {
        vfs.mkdirSync(dir);
      } catch {
        // Already exists — ignore.
      }
    }
    vfs.writeFileSync(path, content);
  }
  return vfs;
}

describe("findOrphanRouteFiles", () => {
  it("returns an empty array when appDirectory does not exist", async () => {
    const routes: RouteManifest = {};
    const result = await findOrphanRouteFiles(routes, "/nonexistent/app/does/not/exist");
    expect(result).toStrictEqual([]);
  });

  it("returns an empty array when all route.tsx files are registered", async () => {
    const vfs = makeVfs({
      "/home/route.tsx": "export default () => null;",
      "/about/route.tsx": "export default () => null;",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
      home: { id: "home", file: "home/route.tsx" },
      about: { id: "about", file: "about/route.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs);
    expect(result).toStrictEqual([]);
  });

  it("returns the unregistered route.tsx as an appDirectory-relative path", async () => {
    const vfs = makeVfs({
      "/home/route.tsx": "export default () => null;",
      "/orphan/route.tsx": "export default () => null;",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
      home: { id: "home", file: "home/route.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs);
    expect(result).toStrictEqual(["orphan/route.tsx"]);
  });

  it("ignores files inside directories listed in excludeDirs (_components)", async () => {
    const vfs = makeVfs({
      "/home/route.tsx": "export default () => null;",
      "/_components/route.tsx": "export default () => null;",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
      home: { id: "home", file: "home/route.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs);
    expect(result).toStrictEqual([]);
  });

  it("ignores files inside directories listed in excludeDirs (+types)", async () => {
    const vfs = makeVfs({
      "/home/route.tsx": "export default () => null;",
      "/home/+types/route.ts": "export type {} from './route';",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
      home: { id: "home", file: "home/route.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs);
    expect(result).toStrictEqual([]);
  });

  it("detects orphan files nested arbitrarily deep", async () => {
    const vfs = makeVfs({
      "/home/route.tsx": "export default () => null;",
      "/deeply/nested/path/route.tsx": "export default () => null;",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
      home: { id: "home", file: "home/route.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs);
    expect(result).toStrictEqual(["deeply/nested/path/route.tsx"]);
  });

  it("returns multiple orphans in sorted order", async () => {
    const vfs = makeVfs({
      "/z-route/route.tsx": "export default () => null;",
      "/a-route/route.tsx": "export default () => null;",
      "/m-route/route.tsx": "export default () => null;",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs);
    expect(result).toStrictEqual(["a-route/route.tsx", "m-route/route.tsx", "z-route/route.tsx"]);
  });

  it("does not treat root.tsx as an orphan because it is in the manifest", async () => {
    const vfs = makeVfs({
      "/root.tsx": "export default () => null;",
    });
    // root.tsx uses file pattern "root.tsx" — not matched by the default patterns (route.tsx etc.),
    // so it would not be picked up anyway. This test uses a custom pattern to confirm the manifest
    // exclusion logic works correctly.
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs, {
      routeFilePatterns: ["**/root.tsx"],
    });
    expect(result).toStrictEqual([]);
  });

  it("respects custom routeFilePatterns", async () => {
    const vfs = makeVfs({
      "/home/index.tsx": "export default () => null;",
      "/about/index.tsx": "export default () => null;",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
      home: { id: "home", file: "home/index.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs, {
      routeFilePatterns: ["**/index.tsx"],
    });
    expect(result).toStrictEqual(["about/index.tsx"]);
  });

  it("respects custom excludeDirs", async () => {
    const vfs = makeVfs({
      "/home/route.tsx": "export default () => null;",
      "/custom-ignored/route.tsx": "export default () => null;",
    });
    const routes: RouteManifest = {
      root: { id: "root", file: "root.tsx" },
      home: { id: "home", file: "home/route.tsx" },
    };

    const result = await findOrphanRouteFiles(routes, "/app", vfs, {
      excludeDirs: ["custom-ignored"],
    });
    expect(result).toStrictEqual([]);
  });
});
