import { describe, expect, it } from "vite-plus/test";

import {
  buildRouteTreeFromManifest,
  matchesRoutePattern,
  parsePathTemplate,
} from "./route-path-pattern";
import type { RouteManifest } from "./vendor/react-router/config/routes";

// ---------------------------------------------------------------------------
// parsePathTemplate
// ---------------------------------------------------------------------------

describe("parsePathTemplate", () => {
  it("parses a plain string literal as a single literal token", () => {
    const result = parsePathTemplate(["/about"], 0);
    expect(result).toEqual([{ kind: "literal", value: "/about" }]);
  });

  it("parses a template literal with one expression", () => {
    const result = parsePathTemplate(["/shops/", "/products"], 1);
    expect(result).toEqual([
      { kind: "literal", value: "/shops/" },
      { kind: "dynamic" },
      { kind: "literal", value: "/products" },
    ]);
  });

  it("parses a template literal with multiple expressions", () => {
    const result = parsePathTemplate(["/", "/", ""], 2);
    expect(result).toEqual([
      { kind: "literal", value: "/" },
      { kind: "dynamic" },
      { kind: "literal", value: "/" },
      { kind: "dynamic" },
      { kind: "literal", value: "" },
    ]);
  });

  it("parses a template literal that starts with an expression", () => {
    const result = parsePathTemplate(["", "/products"], 1);
    expect(result).toEqual([
      { kind: "literal", value: "" },
      { kind: "dynamic" },
      { kind: "literal", value: "/products" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A representative route manifest WITHOUT a catch-all (splat) route, so we can assert non-matching
 * paths cleanly. Covers:
 *
 * - Root wrapper (id "root", path "")
 * - Static routes
 * - Dynamic segment (:shop_id)
 * - Optional segment (:lang?)
 * - Index route
 * - Nested static route under a dynamic segment
 */
const TEST_MANIFEST: RouteManifest = {
  root: { id: "root", path: "", file: "root.tsx" },
  "routes/home": {
    id: "routes/home",
    parentId: "root",
    path: undefined,
    index: true,
    file: "routes/home.tsx",
  },
  "routes/about": { id: "routes/about", parentId: "root", path: "about", file: "routes/about.tsx" },
  "routes/shops": { id: "routes/shops", parentId: "root", path: "shops", file: "routes/shops.tsx" },
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
  "routes/lang": {
    id: "routes/lang",
    parentId: "root",
    path: ":lang?",
    file: "routes/lang.tsx",
  },
};

/** Manifest that includes a catch-all (splat) route, for testing that splat matches work. */
const TEST_MANIFEST_WITH_SPLAT: RouteManifest = {
  ...TEST_MANIFEST,
  "routes/catch-all": {
    id: "routes/catch-all",
    parentId: "root",
    path: "*",
    file: "routes/catch-all.tsx",
  },
};

// ---------------------------------------------------------------------------
// matchesRoutePattern
// ---------------------------------------------------------------------------

describe("matchesRoutePattern", () => {
  const tree = buildRouteTreeFromManifest(TEST_MANIFEST);

  describe("static routes", () => {
    it("matches /about", () => {
      const template = parsePathTemplate(["/about"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("matches root /", () => {
      const template = parsePathTemplate(["/"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("does not match a static path with no matching route (and no dynamic/optional route at that level)", () => {
      // /about has no children, so /about/nope should not match anything.
      const template = parsePathTemplate(["/about/nope"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });

    it("does not match a path with an unknown third segment", () => {
      // /shops/:shop_id only has a "products" child — "nope" doesn't match.
      const template = parsePathTemplate(["/shops/shop_1/nope"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });
  });

  describe("dynamic segments", () => {
    it("matches /shops/:shop_id via dynamic placeholder", () => {
      // Template: `/shops/${shopId}`
      const template = parsePathTemplate(["/shops/", ""], 1);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("matches /shops/:shop_id/products via dynamic placeholder", () => {
      // Template: `/shops/${shopId}/products`
      const template = parsePathTemplate(["/shops/", "/products"], 1);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("matches /shops/:shop_id via template with one expression", () => {
      // Template: `/shops/${id}` => /shops/__dyn0__ => matches /shops/:shop_id
      const template = parsePathTemplate(["/shops/", ""], 1);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("does not match when dynamic placeholder lands in a no-child position", () => {
      // Template: `/${dyn}/about` => /__dyn0__/about
      // The only dynamic top-level route is :lang? which has no "about" child in TEST_MANIFEST.
      const template = parsePathTemplate(["/", "/about"], 1);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });
  });

  describe("trailing dynamic expression", () => {
    it("matches when a trailing expression starts at a query boundary", () => {
      // `?${qs}` can evaluate to an empty query suffix, so the template also denotes the pathname
      // without it.
      const template = parsePathTemplate(["/shops/shop_1/products?", ""], 1);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("does not extend the same leniency to a non-trailing expression", () => {
      // `${x}` here is followed by a literal, so it is a real path segment.
      const template = parsePathTemplate(["/shops/", "/nope"], 1);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });

    it("does not omit a trailing expression glued to the last segment", () => {
      const template = parsePathTemplate(["/shops/shop_1/products", ""], 1);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });
  });

  describe("index route", () => {
    it("matches the index route at /", () => {
      const template = parsePathTemplate(["/"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });
  });

  describe("splat route", () => {
    it("matches a path handled by a splat (*) route", () => {
      const splatTree = buildRouteTreeFromManifest(TEST_MANIFEST_WITH_SPLAT);
      const template = parsePathTemplate(["/anything/goes/here"], 0);
      expect(matchesRoutePattern(splatTree, template, "/")).toBe(true);
    });
  });

  describe("query string and hash stripping", () => {
    it("matches /about?lang=en (strips query string)", () => {
      const template = parsePathTemplate(["/about?lang=en"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("matches /about#section (strips hash)", () => {
      const template = parsePathTemplate(["/about#section"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("matches /about?lang=en#section (strips both)", () => {
      const template = parsePathTemplate(["/about?lang=en#section"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(true);
    });

    it("does not match an unknown path even with query/hash", () => {
      // /about/nope is a leaf with no children, so it should not match.
      const template = parsePathTemplate(["/about/nope?x=1#y"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });
  });

  describe("basename handling", () => {
    it("matches when path includes the basename prefix", () => {
      // `/app/about` should match when basename is `/app`
      const template = parsePathTemplate(["/app/about"], 0);
      expect(matchesRoutePattern(tree, template, "/app")).toBe(true);
    });

    it("matches when path does not include the basename prefix", () => {
      // `/about` should also match when basename is `/app` (basename-stripped path)
      const template = parsePathTemplate(["/about"], 0);
      expect(matchesRoutePattern(tree, template, "/app")).toBe(true);
    });

    it("does not match an unresolvable path regardless of basename", () => {
      // /about/nope is not a valid route even with basename stripping
      const template = parsePathTemplate(["/about/nope"], 0);
      expect(matchesRoutePattern(tree, template, "/app")).toBe(false);
    });
  });

  describe("non-matching paths", () => {
    it("returns false for an empty template (no tokens produce a path)", () => {
      const template = parsePathTemplate([""], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });

    it("returns false for /about/deeper (about has no children)", () => {
      // /about is a leaf route with no children, so /about/deeper should not match.
      const template = parsePathTemplate(["/about/deeper"], 0);
      expect(matchesRoutePattern(tree, template, "/")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// buildRouteTreeFromManifest
// ---------------------------------------------------------------------------

describe("buildRouteTreeFromManifest", () => {
  it("builds a non-empty tree from the test manifest", () => {
    const tree = buildRouteTreeFromManifest(TEST_MANIFEST);
    expect(tree.length).toBeGreaterThan(0);
  });

  it("nests child routes under their parent", () => {
    const tree = buildRouteTreeFromManifest(TEST_MANIFEST);
    const root = tree[0]!;
    expect(root.id).toBe("root");
    expect(root.children).toBeDefined();
    expect(root.children!.length).toBeGreaterThan(0);
  });

  it("handles an empty manifest gracefully", () => {
    const tree = buildRouteTreeFromManifest({});
    expect(tree).toEqual([]);
  });
});
