import { describe, expect, it } from "vite-plus/test";

import { collectRouteParams } from "./route-params";
import type { RouteManifest } from "./vendor/react-router/config/routes";

// ---------------------------------------------------------------------------
// Fixtures — mirrors the style used in route-path-pattern.test.ts
// ---------------------------------------------------------------------------

const BASIC_MANIFEST: RouteManifest = {
  root: { id: "root", path: "", file: "root.tsx" },
  "routes/home": {
    id: "routes/home",
    parentId: "root",
    path: undefined,
    index: true,
    file: "routes/home.tsx",
  },
  "routes/about": {
    id: "routes/about",
    parentId: "root",
    path: "about",
    file: "routes/about.tsx",
  },
  "routes/shops": {
    id: "routes/shops",
    parentId: "root",
    path: "shops",
    file: "routes/shops.tsx",
  },
  "routes/shops.$shop_id": {
    id: "routes/shops.$shop_id",
    parentId: "routes/shops",
    path: ":shop_id",
    file: "routes/shops.$shop_id.tsx",
  },
  "routes/shops.$shop_id.products": {
    id: "routes/shops.$shop_id.products",
    parentId: "routes/shops.$shop_id",
    path: "products",
    file: "routes/shops.$shop_id.products.tsx",
  },
};

const OPTIONAL_MANIFEST: RouteManifest = {
  root: { id: "root", path: "", file: "root.tsx" },
  "routes/lang": {
    id: "routes/lang",
    parentId: "root",
    path: ":lang?",
    file: "routes/lang.tsx",
  },
  "routes/lang.page": {
    id: "routes/lang.page",
    parentId: "routes/lang",
    path: "page",
    file: "routes/lang.page.tsx",
  },
};

const SPLAT_MANIFEST: RouteManifest = {
  root: { id: "root", path: "", file: "root.tsx" },
  "routes/catch-all": {
    id: "routes/catch-all",
    parentId: "root",
    path: "*",
    file: "routes/catch-all.tsx",
  },
};

// A manifest where the same physical file is registered under two route ids.
const MULTI_REGISTRATION_MANIFEST: RouteManifest = {
  root: { id: "root", path: "", file: "root.tsx" },
  "routes/a.$id": {
    id: "routes/a.$id",
    parentId: "root",
    path: "a/:id",
    file: "routes/shared.tsx",
  },
  "routes/b.$slug": {
    id: "routes/b.$slug",
    parentId: "root",
    path: "b/:slug",
    file: "routes/shared.tsx",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collectRouteParams", () => {
  describe("static routes have no params", () => {
    it("returns empty set for root", () => {
      const map = collectRouteParams(BASIC_MANIFEST);
      expect(map.get("root")).toEqual(new Set());
    });

    it("returns empty set for /about", () => {
      const map = collectRouteParams(BASIC_MANIFEST);
      expect(map.get("routes/about")).toEqual(new Set());
    });

    it("returns empty set for /shops (no dynamic segment)", () => {
      const map = collectRouteParams(BASIC_MANIFEST);
      expect(map.get("routes/shops")).toEqual(new Set());
    });
  });

  describe("dynamic segments", () => {
    it("includes :shop_id for the dynamic route itself", () => {
      const map = collectRouteParams(BASIC_MANIFEST);
      expect(map.get("routes/shops.$shop_id")).toEqual(new Set(["shop_id"]));
    });

    it("includes inherited :shop_id for a nested static child", () => {
      const map = collectRouteParams(BASIC_MANIFEST);
      expect(map.get("routes/shops.$shop_id.products")).toEqual(new Set(["shop_id"]));
    });
  });

  describe("index routes", () => {
    it("returns empty set for an index route under a paramless parent", () => {
      const map = collectRouteParams(BASIC_MANIFEST);
      expect(map.get("routes/home")).toEqual(new Set());
    });
  });

  describe("optional params", () => {
    it("strips the trailing ? from optional param names", () => {
      const map = collectRouteParams(OPTIONAL_MANIFEST);
      // :lang? → "lang", not "lang?"
      expect(map.get("routes/lang")).toEqual(new Set(["lang"]));
    });

    it("child route inherits the optional param", () => {
      const map = collectRouteParams(OPTIONAL_MANIFEST);
      expect(map.get("routes/lang.page")).toEqual(new Set(["lang"]));
    });
  });

  describe("splat routes", () => {
    it("includes '*' for a catch-all route", () => {
      const map = collectRouteParams(SPLAT_MANIFEST);
      expect(map.get("routes/catch-all")).toEqual(new Set(["*"]));
    });
  });

  describe("multiple registrations of the same file", () => {
    it("each registration carries its own params independently", () => {
      const map = collectRouteParams(MULTI_REGISTRATION_MANIFEST);
      expect(map.get("routes/a.$id")).toEqual(new Set(["id"]));
      expect(map.get("routes/b.$slug")).toEqual(new Set(["slug"]));
    });
  });

  describe("malformed manifests", () => {
    it("throws a clear error for cyclic parent chains", () => {
      const manifest: RouteManifest = {
        "routes/a": {
          id: "routes/a",
          parentId: "routes/b",
          path: "a/:a",
          file: "routes/a.tsx",
        },
        "routes/b": {
          id: "routes/b",
          parentId: "routes/a",
          path: "b/:b",
          file: "routes/b.tsx",
        },
      };

      expect(() => collectRouteParams(manifest)).toThrow(/Cyclic route parent chain/);
    });
  });

  describe("empty manifest", () => {
    it("returns an empty map", () => {
      const map = collectRouteParams({});
      expect(map.size).toBe(0);
    });
  });
});
