import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assert, describe, expect, it } from "vite-plus/test";

import { buildRouteTree } from "./builder";
import type { RouteConfigEntry } from "./types";
import { RouteManifestError } from "./types";
import {
  buildRouteIndex,
  findByFile,
  getRenderChain,
  getRouteById,
  isPathful,
  isPathless,
  isTerminal,
  isWrapper,
  listRoutes,
  matchUrl,
} from "./utils";

const FIXTURES_DIR = fileURLToPath(import.meta.resolve("../test/fixtures"));
const SCRATCH_APP = resolve(FIXTURES_DIR, "minimal", "app");

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

const sampleTree = buildRouteTree(sampleEntries, { appDirectory: SCRATCH_APP });
const sampleIndex = buildRouteIndex(sampleTree);

describe("buildRouteIndex", () => {
  it("includes the synthesized root as the first entry", () => {
    expect([...sampleIndex.keys()][0]).toBe("root");
  });

  it("indexes every node from the tree", () => {
    expect(sampleIndex.has("routes/home")).toBe(true);
    expect(sampleIndex.has("auth-layout")).toBe(true);
    expect(sampleIndex.has("concerts/section")).toBe(true);
    expect(sampleIndex.has("concerts/city")).toBe(true);
  });
});

describe("getRouteById", () => {
  it("returns the node for an existing id", () => {
    const node = getRouteById(sampleIndex, "routes/about");
    expect(node.file).toBe("routes/about.tsx");
  });

  it("throws RouteManifestError when the id is missing", () => {
    expect(() => getRouteById(sampleIndex, "does-not-exist")).toThrow(RouteManifestError);
  });
});

describe("getRenderChain", () => {
  it("returns root → leaf order, starting with the synthesized root", () => {
    const chain = getRenderChain(sampleIndex, "routes/about");
    expect(chain.map((c) => c.id)).toEqual(["root", "routes/about"]);
  });

  it("includes every wrapper between root and leaf", () => {
    const chain = getRenderChain(sampleIndex, "routes/login");
    expect(chain.map((c) => c.id)).toEqual(["root", "auth-layout", "routes/login"]);
  });

  it("preserves node kind through the chain", () => {
    const [root, authLayout, login] = getRenderChain(sampleIndex, "routes/login");

    assert.isDefined(root);
    assert.isDefined(authLayout);
    assert.isDefined(login);

    expect(root.kind).toBe("layout"); // synthesized root
    expect(authLayout.kind).toBe("layout"); // auth-layout
    expect(login.kind).toBe("leaf"); // login
  });

  it("returns an index leaf as the chain tail when the leaf is an index", () => {
    const chain = getRenderChain(sampleIndex, "concerts/home");
    expect(chain.at(-1)?.kind).toBe("index");
  });

  it("throws RouteManifestError when the id is missing", () => {
    expect(() => getRenderChain(sampleIndex, "missing")).toThrow(RouteManifestError);
  });
});

describe("findByFile", () => {
  it("returns the node matching the file path", () => {
    const node = findByFile(sampleIndex, "routes/about.tsx");
    expect(node?.id).toBe("routes/about");
  });

  it("normalises path separators before comparing", () => {
    const node = findByFile(sampleIndex, "./routes/about.tsx");
    expect(node?.id).toBe("routes/about");
  });

  it("can locate the synthesized root via root.tsx", () => {
    const node = findByFile(sampleIndex, "root.tsx");
    expect(node?.id).toBe("root");
  });

  it("returns undefined when no node matches", () => {
    expect(findByFile(sampleIndex, "no-such-file.tsx")).toBeUndefined();
  });
});

describe("listRoutes", () => {
  it("returns only terminal nodes (index + leaf), excluding wrappers", () => {
    const terminals = listRoutes(sampleTree);
    const ids = terminals.map((t) => t.id);
    expect(ids).toContain("routes/home");
    expect(ids).toContain("routes/about");
    expect(ids).toContain("routes/login");
    expect(ids).toContain("concerts/home");
    expect(ids).toContain("concerts/city");
    expect(ids).not.toContain("root");
    expect(ids).not.toContain("auth-layout");
    expect(ids).not.toContain("concerts/section");
  });

  it("sorts results by fullPath", () => {
    const terminals = listRoutes(sampleTree);
    const patterns = terminals.map((t) => t.fullPath);
    const sorted = [...patterns].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(patterns).toEqual(sorted);
  });

  it("exposes params on each terminal node", () => {
    const terminals = listRoutes(sampleTree);
    const city = terminals.find((t) => t.id === "concerts/city");
    expect(city?.params).toEqual(["city"]);
    const files = terminals.find((t) => t.id === "files");
    expect(files?.params).toEqual(["*"]);
    const about = terminals.find((t) => t.id === "routes/about");
    expect(about?.params).toEqual([]);
  });
});

describe("matchUrl", () => {
  it("matches a static URL", () => {
    const match = matchUrl(sampleTree, "/about");
    expect(match?.terminal.id).toBe("routes/about");
  });

  it("matches an index route at the root URL", () => {
    const match = matchUrl(sampleTree, "/");
    expect(match?.terminal.id).toBe("routes/home");
  });

  it("returns a renderChain that begins at the synthesized root", () => {
    const match = matchUrl(sampleTree, "/login");
    expect(match?.terminal.id).toBe("routes/login");
    expect(match?.renderChain.map((n) => n.id)).toEqual(["root", "auth-layout", "routes/login"]);
  });

  it("extracts dynamic params from the matched URL", () => {
    const match = matchUrl(sampleTree, "/concerts/tokyo");
    expect(match?.terminal.id).toBe("concerts/city");
    expect(match?.params["city"]).toBe("tokyo");
  });

  it("matches splat routes and exposes the splat under '*'", () => {
    const match = matchUrl(sampleTree, "/files/a/b/c");
    expect(match?.terminal.id).toBe("files");
    expect(match?.params["*"]).toBe("a/b/c");
  });

  it("returns null when no route matches", () => {
    expect(matchUrl(sampleTree, "/does-not-exist-9999")).toBeNull();
  });

  it("returns the parent's index entry for the parent's exact path", () => {
    const match = matchUrl(sampleTree, "/concerts");
    expect(match?.terminal.id).toBe("concerts/home");
    expect(match?.terminal.kind).toBe("index");
  });
});

describe("type guards", () => {
  it("isTerminal narrows to TerminalRouteNode (index | leaf)", () => {
    expect(isTerminal(getRouteById(sampleIndex, "routes/home"))).toBe(true);
    expect(isTerminal(getRouteById(sampleIndex, "routes/about"))).toBe(true);
    expect(isTerminal(getRouteById(sampleIndex, "auth-layout"))).toBe(false);
    expect(isTerminal(getRouteById(sampleIndex, "concerts/section"))).toBe(false);
  });

  it("isWrapper narrows to WrapperRouteNode (layout | branch)", () => {
    expect(isWrapper(getRouteById(sampleIndex, "auth-layout"))).toBe(true);
    expect(isWrapper(getRouteById(sampleIndex, "concerts/section"))).toBe(true);
    expect(isWrapper(getRouteById(sampleIndex, "root"))).toBe(true);
    expect(isWrapper(getRouteById(sampleIndex, "routes/about"))).toBe(false);
  });

  it("isPathful is false for pathless index and layout", () => {
    expect(isPathful(getRouteById(sampleIndex, "routes/home"))).toBe(false);
    expect(isPathful(getRouteById(sampleIndex, "auth-layout"))).toBe(false);
    expect(isPathful(getRouteById(sampleIndex, "root"))).toBe(false);
  });

  it("isPathful is true for leaf, branch, and prefix-derived index", () => {
    expect(isPathful(getRouteById(sampleIndex, "routes/about"))).toBe(true);
    expect(isPathful(getRouteById(sampleIndex, "concerts/section"))).toBe(true);
    // concerts/home is a bare index() at this level, no own path → pathless
    expect(isPathful(getRouteById(sampleIndex, "concerts/home"))).toBe(false);
  });

  it("isPathless mirrors isPathful for the discriminated cases", () => {
    expect(isPathless(getRouteById(sampleIndex, "routes/home"))).toBe(true);
    expect(isPathless(getRouteById(sampleIndex, "auth-layout"))).toBe(true);
    expect(isPathless(getRouteById(sampleIndex, "routes/about"))).toBe(false);
    expect(isPathless(getRouteById(sampleIndex, "concerts/section"))).toBe(false);
  });

  it("treats prefix-derived index as pathful", () => {
    const tree = buildRouteTree([{ file: "concerts/home.tsx", index: true, path: "concerts" }], {
      appDirectory: SCRATCH_APP,
    });
    const index = buildRouteIndex(tree);
    const node = getRouteById(index, "concerts/home");
    expect(isPathful(node)).toBe(true);
    expect(isPathless(node)).toBe(false);
  });
});
