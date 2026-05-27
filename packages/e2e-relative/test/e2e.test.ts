import {
  buildRouteIndex,
  getRenderChain,
  listRoutes,
  loadRouteTree,
  matchUrl,
} from "react-router-routing-toolkit";
import { describe, expect, it } from "vite-plus/test";

const projectRoot = import.meta.dirname.replace(/\/test$/, "");

describe("loadRouteTree against a real React Router app using relative() helpers", () => {
  it("evaluates routes.ts and rewrites absolute file paths to app-relative", async () => {
    const tree = await loadRouteTree({ vite: { root: projectRoot } });

    const files = [...buildRouteIndex(tree).values()].map((node) => node.file);
    expect(files).toContain("root.tsx");
    expect(files).toContain("home.tsx");
    expect(files).toContain("auth-layout.tsx");
    expect(files).toContain("login.tsx");
    expect(files).toContain("concerts/home.tsx");
    expect(files).toContain("concerts/city.tsx");
    expect(files).toContain("files.tsx");
  });

  it("renderChain begins at the synthesized root layout", async () => {
    const tree = await loadRouteTree({ vite: { root: projectRoot } });
    const index = buildRouteIndex(tree);

    const login = listRoutes(tree).find((leaf) => leaf.file === "login.tsx");
    expect(login).toBeDefined();
    const chain = getRenderChain(index, login!.id);
    expect(chain.map((c) => c.file)).toEqual(["root.tsx", "auth-layout.tsx", "login.tsx"]);
  });

  it("matches URLs against the tree", async () => {
    const tree = await loadRouteTree({ vite: { root: projectRoot } });

    const cityMatch = matchUrl(tree, "/concerts/tokyo");
    expect(cityMatch?.terminal.file).toBe("concerts/city.tsx");
    expect(cityMatch?.params["city"]).toBe("tokyo");

    const splatMatch = matchUrl(tree, "/files/a/b/c");
    expect(splatMatch?.terminal.file).toBe("files.tsx");
    expect(splatMatch?.params["*"]).toBe("a/b/c");
  });
});
