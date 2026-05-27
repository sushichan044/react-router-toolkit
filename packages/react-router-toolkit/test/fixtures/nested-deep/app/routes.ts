import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("shell.tsx", [
    route("section", "section.tsx", [route(":id", "inner.tsx", [index("inner-index.tsx")])]),
  ]),
] satisfies RouteConfig;
