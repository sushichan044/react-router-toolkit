import { describe, expect, it } from "vite-plus/test";

import { flattenToManifest } from "./flattener";
import type { RouteConfigEntry } from "./types";
import { RouteManifestError } from "./types";

describe("flattenToManifest", () => {
  describe("id resolution", () => {
    it("uses the explicit id when one is provided", () => {
      const manifest = flattenToManifest([
        { file: "routes/about.tsx", path: "about", id: "custom-id" },
      ]);
      expect([...manifest.keys()]).toEqual(["custom-id"]);
    });

    it("derives the id from the file path with the extension stripped", () => {
      const manifest = flattenToManifest([{ file: "routes/about.tsx", path: "about" }]);
      expect([...manifest.keys()]).toEqual(["routes/about"]);
    });

    it("strips every recognised route module extension", () => {
      const manifest = flattenToManifest([
        { file: "a.ts", path: "a" },
        { file: "b.tsx", path: "b" },
        { file: "c.js", path: "c" },
        { file: "d.jsx", path: "d" },
        { file: "e.mjs", path: "e" },
        { file: "f.cjs", path: "f" },
        { file: "g.mts", path: "g" },
        { file: "h.cts", path: "h" },
      ]);
      expect([...manifest.keys()]).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    });

    it("rejects duplicate ids with a RouteManifestError carrying the offending id", () => {
      const entries: RouteConfigEntry[] = [
        { file: "routes/home.tsx", index: true, id: "dup" },
        { file: "routes/about.tsx", path: "about", id: "dup" },
      ];

      expect(() => flattenToManifest(entries)).toThrow(RouteManifestError);

      try {
        flattenToManifest(entries);
        expect.fail("Expected flattenToManifest to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(RouteManifestError);
        expect((err as RouteManifestError).conflictingId).toBe("dup");
      }
    });
  });

  describe("URL pattern construction", () => {
    it("anchors top-level routes at '/'", () => {
      const manifest = flattenToManifest([{ file: "routes/about.tsx", path: "about" }]);
      expect(manifest.get("routes/about")?.fullPath).toBe("/about");
    });

    it("joins parent path with child path", () => {
      const manifest = flattenToManifest([
        {
          file: "concerts/layout.tsx",
          path: "concerts",
          children: [{ file: "concerts/city.tsx", path: ":city" }],
        },
      ]);
      expect(manifest.get("concerts/city")?.fullPath).toBe("/concerts/:city");
    });

    it("inherits parent fullPath for layout entries", () => {
      const manifest = flattenToManifest([
        {
          file: "auth-layout.tsx",
          children: [{ file: "routes/login.tsx", path: "login" }],
        },
      ]);
      expect(manifest.get("auth-layout")?.fullPath).toBe("/");
      expect(manifest.get("routes/login")?.fullPath).toBe("/login");
    });

    it("inherits parent fullPath for index entries", () => {
      const manifest = flattenToManifest([
        {
          file: "concerts/layout.tsx",
          path: "concerts",
          children: [{ file: "concerts/home.tsx", index: true }],
        },
      ]);
      expect(manifest.get("concerts/home")?.fullPath).toBe("/concerts");
    });

    it("collapses repeated slashes when paths arrive with leading slashes", () => {
      const manifest = flattenToManifest([{ file: "routes/files.tsx", path: "/files/*" }]);
      expect(manifest.get("routes/files")?.fullPath).toBe("/files/*");
    });
  });

  describe("entry classification", () => {
    it("marks an entry with children and no path as a layout", () => {
      const manifest = flattenToManifest([
        {
          file: "auth-layout.tsx",
          children: [{ file: "routes/login.tsx", path: "login" }],
        },
      ]);
      expect(manifest.get("auth-layout")).toMatchObject({
        isLayout: true,
        isLeaf: false,
      });
    });

    it("does not classify a path-bearing parent as a layout", () => {
      const manifest = flattenToManifest([
        {
          file: "concerts/section.tsx",
          path: "concerts",
          children: [{ file: "concerts/city.tsx", path: ":city" }],
        },
      ]);
      expect(manifest.get("concerts/section")).toMatchObject({
        isLayout: false,
        isLeaf: false,
      });
    });

    it("marks index entries as leaf and non-layout", () => {
      const manifest = flattenToManifest([
        {
          file: "concerts/section.tsx",
          path: "concerts",
          children: [{ file: "concerts/home.tsx", index: true }],
        },
      ]);
      expect(manifest.get("concerts/home")).toMatchObject({
        index: true,
        isLeaf: true,
        isLayout: false,
      });
    });

    it("marks childless routes as leaf", () => {
      const manifest = flattenToManifest([{ file: "routes/about.tsx", path: "about" }]);
      expect(manifest.get("routes/about")).toMatchObject({
        isLeaf: true,
        isLayout: false,
      });
    });
  });

  describe("parent–child relationships", () => {
    it("links each child to its parent via parentId", () => {
      const manifest = flattenToManifest([
        {
          file: "concerts/layout.tsx",
          path: "concerts",
          children: [{ file: "concerts/city.tsx", path: ":city" }],
        },
      ]);
      expect(manifest.get("concerts/city")?.parentId).toBe("concerts/layout");
      expect(manifest.get("concerts/layout")?.parentId).toBeUndefined();
    });

    it("traverses deeply nested children", () => {
      const manifest = flattenToManifest([
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
      ]);
      expect(manifest.size).toBe(4);
      expect(manifest.get("inner-index")?.parentId).toBe("inner");
      expect(manifest.get("inner-index")?.fullPath).toBe("/section/:id");
    });

    it("preserves depth-first insertion order so parents appear before children", () => {
      const manifest = flattenToManifest([
        {
          file: "shell.tsx",
          children: [
            { file: "first.tsx", path: "first" },
            { file: "second.tsx", path: "second" },
          ],
        },
      ]);
      expect([...manifest.keys()]).toEqual(["shell", "first", "second"]);
    });
  });

  describe("appDirectory normalisation", () => {
    it("rewrites absolute file paths to app-directory-relative POSIX paths", () => {
      const manifest = flattenToManifest([{ file: "/abs/app/routes/about.tsx", path: "about" }], {
        appDirectory: "/abs/app",
      });
      const about = [...manifest.values()][0];
      expect(about?.file).toBe("routes/about.tsx");
      expect(about?.id).toBe("routes/about");
    });

    it("leaves already-relative file paths untouched when appDirectory is given", () => {
      const manifest = flattenToManifest([{ file: "routes/about.tsx", path: "about" }], {
        appDirectory: "/abs/app",
      });
      const about = [...manifest.values()][0];
      expect(about?.file).toBe("routes/about.tsx");
    });

    it("preserves absolute paths exactly when appDirectory is omitted", () => {
      const manifest = flattenToManifest([{ file: "/abs/app/routes/about.tsx", path: "about" }]);
      const about = [...manifest.values()][0];
      expect(about?.file).toBe("/abs/app/routes/about.tsx");
    });
  });

  describe("caseSensitive flag", () => {
    it("propagates caseSensitive=true to the manifest entry", () => {
      const manifest = flattenToManifest([
        { file: "routes/about.tsx", path: "about", caseSensitive: true },
      ]);
      expect(manifest.get("routes/about")?.caseSensitive).toBe(true);
    });

    it("defaults caseSensitive to false when omitted", () => {
      const manifest = flattenToManifest([{ file: "routes/about.tsx", path: "about" }]);
      expect(manifest.get("routes/about")?.caseSensitive).toBe(false);
    });
  });
});
