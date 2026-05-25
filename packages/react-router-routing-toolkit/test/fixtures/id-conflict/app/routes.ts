import { route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("a", "a.tsx", { id: "dup" }),
  route("b", "b.tsx", { id: "dup" }),
] satisfies RouteConfig;
