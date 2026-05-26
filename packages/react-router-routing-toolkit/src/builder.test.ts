import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { buildRouteTree } from "./builder";
import type { LayoutRouteNode, RouteConfigEntry } from "./types";
import { RouteManifestError } from "./types";
import { buildRouteIndex } from "./utils";

const FIXTURES_DIR = fileURLToPath(import.meta.resolve("../test/fixtures"));

function appDir(fixture: string): string {
  return resolve(FIXTURES_DIR, fixture, "app");
}

// A scratch appDirectory containing root.tsx, used for tests that don't care about path
// normalisation specifics.
const SCRATCH_APP = appDir("minimal");

describe("buildRouteTree", () => {
  describe("root synthesis", () => {
    it("places a synthesized root.tsx layout at the top of the tree", () => {
      const tree = buildRouteTree([{ file: "about.tsx", path: "about" }], {
        appDirectory: SCRATCH_APP,
      });
      expect(tree.kind).toBe("layout");
      expect(tree.id).toBe("root");
      expect(tree.parentId).toBeUndefined();
      expect(tree.file).toBe("root.tsx");
      expect(tree.fullPath).toBe("/");
    });

    it("nests every routes.ts entry under the synthesized root", () => {
      const tree = buildRouteTree(
        [
          { file: "home.tsx", index: true },
          { file: "about.tsx", path: "about" },
        ],
        { appDirectory: SCRATCH_APP },
      );
      const root = tree as LayoutRouteNode;
      expect(root.children).toHaveLength(2);
      for (const child of root.children) {
        expect(child.parentId).toBe("root");
      }
    });

    it("throws RouteManifestError when app/root.{ext} cannot be located", () => {
      expect(() =>
        buildRouteTree([{ file: "about.tsx", path: "about" }], {
          appDirectory: "/this/path/does/not/exist",
        }),
      ).toThrow(RouteManifestError);
    });

    it("throws RouteManifestError when a user route resolves to id 'root'", () => {
      const entries: RouteConfigEntry[] = [{ file: "anything.tsx", path: "root", id: "root" }];
      try {
        buildRouteTree(entries, { appDirectory: SCRATCH_APP });
        expect.fail("Expected buildRouteTree to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(RouteManifestError);
        expect((err as RouteManifestError).conflictingId).toBe("root");
      }
    });
  });

  describe("kind classification", () => {
    it("classifies a bare index() entry as an IndexRouteNode with no path", () => {
      const tree = buildRouteTree([{ file: "home.tsx", index: true }], {
        appDirectory: SCRATCH_APP,
      });
      const home = buildRouteIndex(tree).get("home");
      expect(home?.kind).toBe("index");
      expect(home?.kind === "index" && home.path).toBeUndefined();
    });

    it("classifies a prefix()-wrapped index() as an IndexRouteNode with the prefix path", () => {
      const tree = buildRouteTree([{ file: "concerts/home.tsx", index: true, path: "concerts" }], {
        appDirectory: SCRATCH_APP,
      });
      const concertsHome = buildRouteIndex(tree).get("concerts/home");
      expect(concertsHome?.kind).toBe("index");
      expect(concertsHome?.kind === "index" && concertsHome.path).toBe("concerts");
      expect(concertsHome?.fullPath).toBe("/concerts");
    });

    it("classifies a pathless wrapper as a LayoutRouteNode", () => {
      const tree = buildRouteTree(
        [
          {
            file: "auth-layout.tsx",
            children: [{ file: "login.tsx", path: "login" }],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      const layout = buildRouteIndex(tree).get("auth-layout");
      expect(layout?.kind).toBe("layout");
    });

    it("classifies a pathful childless route as a LeafRouteNode", () => {
      const tree = buildRouteTree([{ file: "about.tsx", path: "about" }], {
        appDirectory: SCRATCH_APP,
      });
      const about = buildRouteIndex(tree).get("about");
      expect(about?.kind).toBe("leaf");
      expect(about?.kind === "leaf" && about.path).toBe("about");
    });

    it("classifies a pathful wrapper as a BranchRouteNode", () => {
      const tree = buildRouteTree(
        [
          {
            file: "concerts/section.tsx",
            path: "concerts",
            children: [{ file: "concerts/city.tsx", path: ":city" }],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      const section = buildRouteIndex(tree).get("concerts/section");
      expect(section?.kind).toBe("branch");
    });

    it("rejects a structurally empty entry (no path, no index, no children)", () => {
      expect(() =>
        buildRouteTree([{ file: "useless.tsx" }], { appDirectory: SCRATCH_APP }),
      ).toThrow(RouteManifestError);
    });
  });

  describe("id resolution", () => {
    it("uses the explicit id when one is provided", () => {
      const tree = buildRouteTree([{ file: "about.tsx", path: "about", id: "custom-id" }], {
        appDirectory: SCRATCH_APP,
      });
      expect(buildRouteIndex(tree).has("custom-id")).toBe(true);
    });

    it("derives the id from the file path with the extension stripped", () => {
      const tree = buildRouteTree([{ file: "routes/about.tsx", path: "about" }], {
        appDirectory: SCRATCH_APP,
      });
      expect(buildRouteIndex(tree).has("routes/about")).toBe(true);
    });

    it("strips every recognised route module extension", () => {
      const tree = buildRouteTree(
        [
          { file: "a.ts", path: "a" },
          { file: "b.tsx", path: "b" },
          { file: "c.js", path: "c" },
          { file: "d.jsx", path: "d" },
          { file: "e.mjs", path: "e" },
          { file: "f.cjs", path: "f" },
          { file: "g.mts", path: "g" },
          { file: "h.cts", path: "h" },
        ],
        { appDirectory: SCRATCH_APP },
      );
      expect([...buildRouteIndex(tree).keys()]).toEqual([
        "root",
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
      ]);
    });

    it("rejects duplicate ids with a RouteManifestError carrying the offending id", () => {
      const entries: RouteConfigEntry[] = [
        { file: "home.tsx", index: true, id: "dup" },
        { file: "about.tsx", path: "about", id: "dup" },
      ];
      try {
        buildRouteTree(entries, { appDirectory: SCRATCH_APP });
        expect.fail("Expected buildRouteTree to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(RouteManifestError);
        expect((err as RouteManifestError).conflictingId).toBe("dup");
      }
    });
  });

  describe("URL pattern construction", () => {
    it("anchors top-level routes at '/'", () => {
      const tree = buildRouteTree([{ file: "about.tsx", path: "about" }], {
        appDirectory: SCRATCH_APP,
      });
      expect(buildRouteIndex(tree).get("about")?.fullPath).toBe("/about");
    });

    it("joins parent path with child path", () => {
      const tree = buildRouteTree(
        [
          {
            file: "concerts/layout.tsx",
            path: "concerts",
            children: [{ file: "concerts/city.tsx", path: ":city" }],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      expect(buildRouteIndex(tree).get("concerts/city")?.fullPath).toBe("/concerts/:city");
    });

    it("inherits parent fullPath for layout entries", () => {
      const tree = buildRouteTree(
        [
          {
            file: "auth-layout.tsx",
            children: [{ file: "login.tsx", path: "login" }],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      expect(buildRouteIndex(tree).get("auth-layout")?.fullPath).toBe("/");
      expect(buildRouteIndex(tree).get("login")?.fullPath).toBe("/login");
    });

    it("inherits parent fullPath for index entries", () => {
      const tree = buildRouteTree(
        [
          {
            file: "concerts/layout.tsx",
            path: "concerts",
            children: [{ file: "concerts/home.tsx", index: true }],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      expect(buildRouteIndex(tree).get("concerts/home")?.fullPath).toBe("/concerts");
    });

    it("collapses repeated slashes when paths arrive with leading slashes", () => {
      const tree = buildRouteTree([{ file: "files.tsx", path: "/files/*" }], {
        appDirectory: SCRATCH_APP,
      });
      expect(buildRouteIndex(tree).get("files")?.fullPath).toBe("/files/*");
    });
  });

  describe("params extraction", () => {
    it("extracts dynamic params from the fullPath", () => {
      const tree = buildRouteTree(
        [
          {
            file: "concerts/section.tsx",
            path: "concerts",
            children: [{ file: "concerts/city.tsx", path: ":city" }],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      expect(buildRouteIndex(tree).get("concerts/city")?.params).toEqual(["city"]);
    });

    it("represents splat segments as '*'", () => {
      const tree = buildRouteTree([{ file: "files.tsx", path: "files/*" }], {
        appDirectory: SCRATCH_APP,
      });
      expect(buildRouteIndex(tree).get("files")?.params).toEqual(["*"]);
    });
  });

  describe("parent-child relationships", () => {
    it("links each child to its parent via parentId", () => {
      const tree = buildRouteTree(
        [
          {
            file: "concerts/layout.tsx",
            path: "concerts",
            children: [{ file: "concerts/city.tsx", path: ":city" }],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      const index = buildRouteIndex(tree);
      expect(index.get("concerts/city")?.parentId).toBe("concerts/layout");
      expect(index.get("concerts/layout")?.parentId).toBe("root");
    });

    it("traverses deeply nested children", () => {
      const tree = buildRouteTree(
        [
          {
            file: "shell.tsx",
            children: [
              {
                file: "section.tsx",
                path: "section",
                children: [
                  {
                    file: "inner.tsx",
                    path: ":id",
                    children: [{ file: "inner-index.tsx", index: true }],
                  },
                ],
              },
            ],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      const index = buildRouteIndex(tree);
      expect(index.size).toBe(5); // root + 4 entries
      expect(index.get("inner-index")?.parentId).toBe("inner");
      expect(index.get("inner-index")?.fullPath).toBe("/section/:id");
    });

    it("preserves depth-first insertion order with the root first", () => {
      const tree = buildRouteTree(
        [
          {
            file: "shell.tsx",
            children: [
              { file: "first.tsx", path: "first" },
              { file: "second.tsx", path: "second" },
            ],
          },
        ],
        { appDirectory: SCRATCH_APP },
      );
      expect([...buildRouteIndex(tree).keys()]).toEqual(["root", "shell", "first", "second"]);
    });
  });

  describe("appDirectory normalisation", () => {
    it("rewrites absolute file paths to app-directory-relative POSIX paths", () => {
      const absolute = resolve(SCRATCH_APP, "about.tsx");
      const tree = buildRouteTree([{ file: absolute, path: "about" }], {
        appDirectory: SCRATCH_APP,
      });
      const about = buildRouteIndex(tree).get("about");
      expect(about?.file).toBe("about.tsx");
    });

    it("leaves already-relative file paths untouched", () => {
      const tree = buildRouteTree([{ file: "routes/about.tsx", path: "about" }], {
        appDirectory: SCRATCH_APP,
      });
      const about = buildRouteIndex(tree).get("routes/about");
      expect(about?.file).toBe("routes/about.tsx");
    });
  });

  describe("caseSensitive flag", () => {
    it("propagates caseSensitive=true to the node", () => {
      const tree = buildRouteTree([{ file: "about.tsx", path: "about", caseSensitive: true }], {
        appDirectory: SCRATCH_APP,
      });
      expect(buildRouteIndex(tree).get("about")?.caseSensitive).toBe(true);
    });

    it("defaults caseSensitive to false when omitted", () => {
      const tree = buildRouteTree([{ file: "about.tsx", path: "about" }], {
        appDirectory: SCRATCH_APP,
      });
      expect(buildRouteIndex(tree).get("about")?.caseSensitive).toBe(false);
    });
  });
});
