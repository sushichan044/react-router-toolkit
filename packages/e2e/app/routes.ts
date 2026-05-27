import { index, layout, prefix, route } from "@react-router/dev/routes";
import type { RouteConfig } from "@react-router/dev/routes";

export default [
  index("home.tsx"),
  layout("auth-layout.tsx", [route("login", "login.tsx"), route("register", "register.tsx")]),
  ...prefix("concerts", [index("concerts/home.tsx"), route(":city", "concerts/city.tsx")]),
  route("files/*", "files.tsx"),
] satisfies RouteConfig;
