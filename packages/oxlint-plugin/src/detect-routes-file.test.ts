import { resolve as resolvePath } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { detectRoutesContext } from "./detect-routes-file";

const ROUTES_SOURCE = `import { index } from "@react-router/dev/routes";\nexport default [index("home.tsx")];`;

describe("detectRoutesContext", () => {
  it("derives root and appDirectory from a conventional app/routes.ts", () => {
    const context = detectRoutesContext("/project/app/routes.ts", ROUTES_SOURCE, undefined);

    expect(context).toEqual({
      appDirectory: "/project/app",
      root: "/project",
    });
  });

  it("recognises fs-routes config via its import marker", () => {
    const source = `import { flatRoutes } from "@react-router/fs-routes";\nexport default flatRoutes();`;
    const context = detectRoutesContext("/project/app/routes.ts", source, undefined);

    expect(context?.appDirectory).toBe("/project/app");
  });

  it("ignores files not named routes.ts", () => {
    expect(detectRoutesContext("/project/app/router.ts", ROUTES_SOURCE, undefined)).toBeNull();
  });

  it("ignores a routes.ts that does not import a route config helper", () => {
    const source = `export default [];`;
    expect(detectRoutesContext("/project/app/routes.ts", source, undefined)).toBeNull();
  });

  it("honours explicit root and appDirectory options", () => {
    const context = detectRoutesContext("/anywhere/routes.ts", ROUTES_SOURCE, {
      appDirectory: "src/app",
      root: "src",
    });

    expect(context).toEqual({
      appDirectory: resolvePath("src/app"),
      root: resolvePath("src"),
    });
  });
});
