import { createRouteManifest, listRoutes, matchUrl } from "react-router-routing-toolkit";
import { describe, expect, it } from "vite-plus/test";

describe("createRouteManifest against a real React Router app using relative() helpers", () => {
  it("evaluates routes.ts and rewrites absolute file paths to app-relative", async () => {
    const manifest = await createRouteManifest({
      root: import.meta.dirname.replace(/\/test$/, ""),
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
      root: import.meta.dirname.replace(/\/test$/, ""),
    });

    const leaves = listRoutes(manifest);
    const login = leaves.find((leaf) => leaf.file === "login.tsx");
    expect(login?.layoutChain.map((c) => c.file)).toEqual(["auth-layout.tsx", "login.tsx"]);
  });

  it("matches URLs against the manifest", async () => {
    const manifest = await createRouteManifest({
      root: import.meta.dirname.replace(/\/test$/, ""),
    });

    const cityMatch = matchUrl(manifest, "/concerts/tokyo");
    expect(cityMatch?.leaf.file).toBe("concerts/city.tsx");
    expect(cityMatch?.params["city"]).toBe("tokyo");

    const splatMatch = matchUrl(manifest, "/files/a/b/c");
    expect(splatMatch?.leaf.file).toBe("files.tsx");
    expect(splatMatch?.params["*"]).toBe("a/b/c");
  });
});
