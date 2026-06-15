import { eslintCompatPlugin } from "@oxlint/plugins";

import pkg from "../package.json" with { type: "json" };
import noCrossRouteImports from "./rules/no-cross-route-imports";
import noUnknownRouteExports from "./rules/no-unknown-route-exports";
import noUnresolvedRoutePath from "./rules/no-unresolved-route-path";
import typeSafeOutletContext from "./rules/type-safe-outlet-context";
import validRouteFile from "./rules/valid-route-file";
import validRouteParams from "./rules/valid-route-params";
import validRouteTypeImports from "./rules/valid-route-type-imports";

const plugin = eslintCompatPlugin({
  meta: {
    name: pkg.name,
  },
  rules: {
    "valid-route-file": validRouteFile,
    "type-safe-outlet-context": typeSafeOutletContext,
    "valid-route-type-imports": validRouteTypeImports,
    "no-unresolved-route-path": noUnresolvedRoutePath,
    "no-unknown-route-exports": noUnknownRouteExports,
    "no-cross-route-imports": noCrossRouteImports,
    "valid-route-params": validRouteParams,
  },
});

export default plugin;
