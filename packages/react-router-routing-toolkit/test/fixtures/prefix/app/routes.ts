import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  ...prefix("concerts", [index("concerts/home.tsx"), route(":city", "concerts/city.tsx")]),
] satisfies RouteConfig;
