import { eslintCompatPlugin } from "@oxlint/plugins";

import pkg from "../package.json" with { type: "json" };
import typeSafeOutletContext from "./rules/type-safe-outlet-context";
import validRouteFile from "./rules/valid-route-file";
import validRouteTypeImports from "./rules/valid-route-type-imports";

const plugin = eslintCompatPlugin({
  meta: {
    name: pkg.name,
  },
  rules: {
    "valid-route-file": validRouteFile,
    "type-safe-outlet-context": typeSafeOutletContext,
    "valid-route-type-imports": validRouteTypeImports,
  },
});

export default plugin;
