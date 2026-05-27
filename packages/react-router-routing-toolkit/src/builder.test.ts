import { describe, expect, it } from "vite-plus/test";

import { buildRouteTree } from "./builder";
import { RouteManifestError } from "./errors";
import type { LayoutRouteNode, RouteManifest, RouteManifestEntry } from "./types";
import { buildRouteIndex } from "./utils";

/** Build a {@link RouteManifest} from entries, preserving declaration order (as React Router does). */
function manifest(...entries: RouteManifestEntry[]): RouteManifest {
  const result: Record<string, RouteManifestEntry> = {};
  for (const entry of entries) {
    result[entry.id] = entry;
  }
  return result;
}

/** The synthesized root entry React Router always emits for app/root.tsx. */
const ROOT: RouteManifestEntry = { id: "root", file: "root.tsx", path: "" };

describe("buildRouteTree", () => {
  describe("root", () => {
    it("uses the manifest's parentless entry as the synthesized root layout", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "about", parentId: "root", file: "about.tsx", path: "about" }),
      );
      expect(tree.kind).toBe("layout");
      expect(tree.id).toBe("root");
      expect(tree.parentId).toBeUndefined();
      expect(tree.file).toBe("root.tsx");
      expect(tree.fullPath).toBe("/");
    });

    it("links every top-level entry to the root via parentId", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          { id: "home", parentId: "root", file: "home.tsx", index: true },
          { id: "about", parentId: "root", file: "about.tsx", path: "about" },
        ),
      );
      const root = tree as LayoutRouteNode;
      expect(root.children).toHaveLength(2);
      for (const child of root.children) {
        expect(child.parentId).toBe("root");
      }
    });

    it("throws RouteManifestError when no parentless root entry exists", () => {
      expect(() =>
        buildRouteTree(manifest({ id: "orphan", parentId: "missing", file: "x.tsx", path: "x" })),
      ).toThrow(RouteManifestError);
    });
  });

  describe("kind classification", () => {
    it("classifies a bare index entry as an IndexRouteNode with no path", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "home", parentId: "root", file: "home.tsx", index: true }),
      );
      const home = buildRouteIndex(tree).get("home");
      expect(home?.kind).toBe("index");
      expect(home?.kind === "index" && home.path).toBeUndefined();
    });

    it("classifies a prefix-wrapped index as an IndexRouteNode carrying the prefix path", () => {
      const tree = buildRouteTree(
        manifest(ROOT, {
          id: "concerts/home",
          parentId: "root",
          file: "concerts/home.tsx",
          index: true,
          path: "concerts",
        }),
      );
      const concertsHome = buildRouteIndex(tree).get("concerts/home");
      expect(concertsHome?.kind).toBe("index");
      expect(concertsHome?.kind === "index" && concertsHome.path).toBe("concerts");
      expect(concertsHome?.fullPath).toBe("/concerts");
    });

    it("classifies a pathless entry with children as a LayoutRouteNode", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          { id: "auth-layout", parentId: "root", file: "auth-layout.tsx" },
          { id: "login", parentId: "auth-layout", file: "login.tsx", path: "login" },
        ),
      );
      expect(buildRouteIndex(tree).get("auth-layout")?.kind).toBe("layout");
    });

    it("classifies a pathful childless entry as a LeafRouteNode", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "about", parentId: "root", file: "about.tsx", path: "about" }),
      );
      const about = buildRouteIndex(tree).get("about");
      expect(about?.kind).toBe("leaf");
      expect(about?.kind === "leaf" && about.path).toBe("about");
    });

    it("classifies a pathful entry with children as a BranchRouteNode", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          {
            id: "concerts/section",
            parentId: "root",
            file: "concerts/section.tsx",
            path: "concerts",
          },
          {
            id: "concerts/city",
            parentId: "concerts/section",
            file: "concerts/city.tsx",
            path: ":city",
          },
        ),
      );
      expect(buildRouteIndex(tree).get("concerts/section")?.kind).toBe("branch");
    });

    it("rejects a structurally empty entry (no path, no index, no children)", () => {
      expect(() =>
        buildRouteTree(manifest(ROOT, { id: "useless", parentId: "root", file: "useless.tsx" })),
      ).toThrow(RouteManifestError);
    });
  });

  describe("identifiers", () => {
    it("uses the manifest id verbatim", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "custom-id", parentId: "root", file: "about.tsx", path: "about" }),
      );
      expect(buildRouteIndex(tree).has("custom-id")).toBe(true);
    });

    it("preserves an absolute id produced by the relative() helper without rewriting it", () => {
      const absoluteId = "/Users/me/app/home";
      const tree = buildRouteTree(
        manifest(ROOT, { id: absoluteId, parentId: "root", file: "home.tsx", index: true }),
      );
      const index = buildRouteIndex(tree);
      expect(index.has(absoluteId)).toBe(true);
      expect(index.get(absoluteId)?.file).toBe("home.tsx");
    });
  });

  describe("URL pattern construction", () => {
    it("anchors top-level routes at '/'", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "about", parentId: "root", file: "about.tsx", path: "about" }),
      );
      expect(buildRouteIndex(tree).get("about")?.fullPath).toBe("/about");
    });

    it("joins parent path with child path", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          {
            id: "concerts/layout",
            parentId: "root",
            file: "concerts/layout.tsx",
            path: "concerts",
          },
          {
            id: "concerts/city",
            parentId: "concerts/layout",
            file: "concerts/city.tsx",
            path: ":city",
          },
        ),
      );
      expect(buildRouteIndex(tree).get("concerts/city")?.fullPath).toBe("/concerts/:city");
    });

    it("inherits the parent fullPath for pathless layout entries", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          { id: "auth-layout", parentId: "root", file: "auth-layout.tsx" },
          { id: "login", parentId: "auth-layout", file: "login.tsx", path: "login" },
        ),
      );
      expect(buildRouteIndex(tree).get("auth-layout")?.fullPath).toBe("/");
      expect(buildRouteIndex(tree).get("login")?.fullPath).toBe("/login");
    });

    it("collapses repeated slashes when a path arrives with a leading slash", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "files", parentId: "root", file: "files.tsx", path: "/files/*" }),
      );
      expect(buildRouteIndex(tree).get("files")?.fullPath).toBe("/files/*");
    });
  });

  describe("params extraction", () => {
    it("extracts dynamic params from the fullPath", () => {
      const tree = buildRouteTree(
        manifest(ROOT, {
          id: "concerts/city",
          parentId: "root",
          file: "concerts/city.tsx",
          path: "concerts/:city",
        }),
      );
      expect(buildRouteIndex(tree).get("concerts/city")?.params).toEqual(["city"]);
    });

    it("represents splat segments as '*'", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "files", parentId: "root", file: "files.tsx", path: "files/*" }),
      );
      expect(buildRouteIndex(tree).get("files")?.params).toEqual(["*"]);
    });
  });

  describe("parent-child relationships", () => {
    it("links each child to its parent via parentId", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          {
            id: "concerts/layout",
            parentId: "root",
            file: "concerts/layout.tsx",
            path: "concerts",
          },
          {
            id: "concerts/city",
            parentId: "concerts/layout",
            file: "concerts/city.tsx",
            path: ":city",
          },
        ),
      );
      const index = buildRouteIndex(tree);
      expect(index.get("concerts/city")?.parentId).toBe("concerts/layout");
      expect(index.get("concerts/layout")?.parentId).toBe("root");
    });

    it("traverses deeply nested children", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          { id: "shell", parentId: "root", file: "shell.tsx" },
          { id: "section", parentId: "shell", file: "section.tsx", path: "section" },
          { id: "inner", parentId: "section", file: "inner.tsx", path: ":id" },
          { id: "inner-index", parentId: "inner", file: "inner-index.tsx", index: true },
        ),
      );
      const index = buildRouteIndex(tree);
      expect(index.size).toBe(5); // root + 4 entries
      expect(index.get("inner-index")?.parentId).toBe("inner");
      expect(index.get("inner-index")?.fullPath).toBe("/section/:id");
    });

    it("preserves manifest insertion order among siblings, with the root first", () => {
      const tree = buildRouteTree(
        manifest(
          ROOT,
          { id: "shell", parentId: "root", file: "shell.tsx" },
          { id: "first", parentId: "shell", file: "first.tsx", path: "first" },
          { id: "second", parentId: "shell", file: "second.tsx", path: "second" },
        ),
      );
      expect([...buildRouteIndex(tree).keys()]).toEqual(["root", "shell", "first", "second"]);
    });
  });

  describe("caseSensitive flag", () => {
    it("propagates caseSensitive=true to the node", () => {
      const tree = buildRouteTree(
        manifest(ROOT, {
          id: "about",
          parentId: "root",
          file: "about.tsx",
          path: "about",
          caseSensitive: true,
        }),
      );
      expect(buildRouteIndex(tree).get("about")?.caseSensitive).toBe(true);
    });

    it("defaults caseSensitive to false when omitted", () => {
      const tree = buildRouteTree(
        manifest(ROOT, { id: "about", parentId: "root", file: "about.tsx", path: "about" }),
      );
      expect(buildRouteIndex(tree).get("about")?.caseSensitive).toBe(false);
    });
  });
});
