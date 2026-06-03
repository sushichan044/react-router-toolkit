import { eslintCompatPlugin } from "@oxlint/plugins";

import pkg from "../package.json" with { type: "json" };
import validRouteFile from "./rules/valid-route-file";

const plugin = eslintCompatPlugin({
  meta: {
    name: pkg.name,
  },
  rules: {
    "valid-route-file": validRouteFile,
  },
});

export default plugin;
