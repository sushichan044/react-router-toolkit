import { fileURLToPath } from "node:url";

import { createRouteManifest, listRoutes, matchUrl } from "react-router-routing-toolkit";
import { describe, expect, it } from "vite-plus/test";

describe("createRouteManifest against a real React Router app", () => {
  const root = fileURLToPath(import.meta.resolve(".."));

  it("evaluates routes.ts through the reactRouter() Vite plugin", async () => {
    const manifest = await createRouteManifest({
      root,
    });

    const files = [...manifest.values()].map((entry) => entry.file);
    expect(files).toContain("home.tsx");
    expect(files).toContain("auth-layout.tsx");
    expect(files).toContain("login.tsx");
    expect(files).toContain("concerts/home.tsx");
    expect(files).toContain("concerts/city.tsx");
    expect(files).toContain("files.tsx");
  });

  it("rebuilds layout chains correctly", async () => {
    const manifest = await createRouteManifest({
      root,
    });

    const leaves = listRoutes(manifest);
    const login = leaves.find((leaf) => leaf.file === "login.tsx");
    expect(login?.layoutChain.map((c) => c.file)).toEqual(["auth-layout.tsx", "login.tsx"]);
  });

  it("matches URLs against the real plugin-resolved manifest", async () => {
    const manifest = await createRouteManifest({
      root,
    });

    const cityMatch = matchUrl(manifest, "/concerts/tokyo");
    expect(cityMatch?.leaf.file).toBe("concerts/city.tsx");
    expect(cityMatch?.params["city"]).toBe("tokyo");

    const splatMatch = matchUrl(manifest, "/files/a/b/c");
    expect(splatMatch?.leaf.file).toBe("files.tsx");
    expect(splatMatch?.params["*"]).toBe("a/b/c");
  });
});
