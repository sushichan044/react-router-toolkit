import { layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("auth-layout.tsx", [route("login", "login.tsx"), route("register", "register.tsx")]),
] satisfies RouteConfig;
