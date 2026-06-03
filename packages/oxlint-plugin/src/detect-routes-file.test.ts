import { describe, expect, it } from "vite-plus/test";

import { isRoutesConfigFile } from "./detect-routes-file";

const ROUTES_SOURCE = `import { index } from "@react-router/dev/routes";\nexport default [index("home.tsx")];`;
const APP_DIR = "/project/app";

describe("isRoutesConfigFile", () => {
  it("accepts a routes.ts directly inside the resolved app directory", () => {
    expect(isRoutesConfigFile("/project/app/routes.ts", ROUTES_SOURCE, APP_DIR)).toBe(true);
  });

  it("recognises fs-routes config via its import marker", () => {
    const source = `import { flatRoutes } from "@react-router/fs-routes";\nexport default flatRoutes();`;
    expect(isRoutesConfigFile("/project/app/routes.ts", source, APP_DIR)).toBe(true);
  });

  it("rejects a routes file outside the resolved app directory", () => {
    expect(isRoutesConfigFile("/project/other/routes.ts", ROUTES_SOURCE, APP_DIR)).toBe(false);
  });

  it("rejects files not named routes.*", () => {
    expect(isRoutesConfigFile("/project/app/router.ts", ROUTES_SOURCE, APP_DIR)).toBe(false);
  });

  it("rejects a routes file that does not import a route config helper", () => {
    expect(isRoutesConfigFile("/project/app/routes.ts", `export default [];`, APP_DIR)).toBe(false);
  });
});
