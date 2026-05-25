import { describe, expect, it } from "vite-plus/test";

import { flattenToManifest } from "./flattener";
import type { RouteConfigEntry } from "./types";
import { RouteManifestError } from "./types";
import { findByFile, getLayoutChain, getRouteById, listRoutes, matchUrl } from "./utils";

const sampleEntries: readonly RouteConfigEntry[] = [
  { file: "routes/home.tsx", index: true },
  { file: "routes/about.tsx", path: "about" },
  {
    file: "auth-layout.tsx",
    children: [
      { file: "routes/login.tsx", path: "login" },
      { file: "routes/register.tsx", path: "register" },
    ],
  },
  {
    file: "concerts/section.tsx",
    path: "concerts",
    children: [
      { file: "concerts/home.tsx", index: true },
      { file: "concerts/city.tsx", path: ":city" },
    ],
  },
  { file: "files.tsx", path: "files/*" },
];

const sampleManifest = flattenToManifest(sampleEntries);

describe("getRouteById", () => {
  it("returns the manifest entry for an existing id", () => {
    const entry = getRouteById(sampleManifest, "routes/about");
    expect(entry.file).toBe("routes/about.tsx");
  });

  it("throws RouteManifestError when the id is missing", () => {
    expect(() => getRouteById(sampleManifest, "does-not-exist")).toThrow(RouteManifestError);
  });
});

describe("getLayoutChain", () => {
  it("returns just the entry itself for a top-level route", () => {
    const chain = getLayoutChain(sampleManifest, "routes/about");
    expect(chain).toHaveLength(1);
    expect(chain[0]?.id).toBe("routes/about");
  });

  it("returns root → leaf order for nested routes", () => {
    const chain = getLayoutChain(sampleManifest, "routes/login");
    expect(chain.map((c) => c.id)).toEqual(["auth-layout", "routes/login"]);
  });

  it("preserves the layout flag for layout entries", () => {
    const chain = getLayoutChain(sampleManifest, "routes/login");
    expect(chain[0]?.isLayout).toBe(true);
    expect(chain[1]?.isLayout).toBe(false);
  });

  it("preserves the index flag for index entries", () => {
    const chain = getLayoutChain(sampleManifest, "concerts/home");
    expect(chain.at(-1)?.isIndex).toBe(true);
    expect(chain.at(-2)?.isIndex).toBe(false);
  });

  it("throws RouteManifestError when the id is missing", () => {
    expect(() => getLayoutChain(sampleManifest, "missing")).toThrow(RouteManifestError);
  });
});

describe("findByFile", () => {
  it("returns the entry matching the file path", () => {
    const entry = findByFile(sampleManifest, "routes/about.tsx");
    expect(entry?.id).toBe("routes/about");
  });

  it("normalises path separators before comparing", () => {
    const entry = findByFile(sampleManifest, "./routes/about.tsx");
    expect(entry?.id).toBe("routes/about");
  });

  it("returns undefined when no entry matches", () => {
    expect(findByFile(sampleManifest, "no-such-file.tsx")).toBeUndefined();
  });
});

describe("listRoutes", () => {
  it("includes only leaf entries (index routes and child-less routes)", () => {
    const leaves = listRoutes(sampleManifest);
    const ids = leaves.map((r) => r.id);
    expect(ids).toContain("routes/home");
    expect(ids).toContain("routes/about");
    expect(ids).toContain("routes/login");
    expect(ids).toContain("concerts/home");
    expect(ids).toContain("concerts/city");
    expect(ids).not.toContain("auth-layout");
    expect(ids).not.toContain("concerts/section");
  });

  it("sorts results by urlPattern", () => {
    const leaves = listRoutes(sampleManifest);
    const patterns = leaves.map((r) => r.urlPattern);
    const sorted = [...patterns].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(patterns).toEqual(sorted);
  });

  it("attaches a root → leaf layoutChain to each entry", () => {
    const leaves = listRoutes(sampleManifest);
    const login = leaves.find((r) => r.id === "routes/login");
    expect(login?.layoutChain.map((c) => c.id)).toEqual(["auth-layout", "routes/login"]);
  });

  it("extracts dynamic params from the URL pattern", () => {
    const leaves = listRoutes(sampleManifest);
    const city = leaves.find((r) => r.id === "concerts/city");
    expect(city?.params).toEqual(["city"]);
  });

  it("represents splat segments as '*' in params", () => {
    const leaves = listRoutes(sampleManifest);
    const files = leaves.find((r) => r.id === "files");
    expect(files?.params).toEqual(["*"]);
  });

  it("returns an empty params array for fully static routes", () => {
    const leaves = listRoutes(sampleManifest);
    const about = leaves.find((r) => r.id === "routes/about");
    expect(about?.params).toEqual([]);
  });
});

describe("matchUrl", () => {
  it("matches a static URL", () => {
    const match = matchUrl(sampleManifest, "/about");
    expect(match?.leaf.id).toBe("routes/about");
  });

  it("matches an index route under its layout parent", () => {
    const match = matchUrl(sampleManifest, "/");
    expect(match?.leaf.id).toBe("routes/home");
  });

  it("matches a nested route and exposes its layout chain", () => {
    const match = matchUrl(sampleManifest, "/login");
    expect(match?.leaf.id).toBe("routes/login");
    expect(match?.layoutChain.map((c) => c.id)).toEqual(["auth-layout", "routes/login"]);
  });

  it("extracts dynamic params from the matched URL", () => {
    const match = matchUrl(sampleManifest, "/concerts/tokyo");
    expect(match?.leaf.id).toBe("concerts/city");
    expect(match?.params["city"]).toBe("tokyo");
  });

  it("matches splat routes and exposes the splat under '*'", () => {
    const match = matchUrl(sampleManifest, "/files/a/b/c");
    expect(match?.leaf.id).toBe("files");
    expect(match?.params["*"]).toBe("a/b/c");
  });

  it("returns null when no route matches", () => {
    expect(matchUrl(sampleManifest, "/does-not-exist-9999")).toBeNull();
  });

  it("returns the parent's index entry for the parent's exact path", () => {
    const match = matchUrl(sampleManifest, "/concerts");
    expect(match?.leaf.id).toBe("concerts/home");
    expect(match?.leaf.index).toBe(true);
  });
});
