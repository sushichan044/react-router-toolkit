import { relative, type RouteConfig } from "@react-router/dev/routes";

const { index, layout, prefix, route } = relative(import.meta.dirname);

export default [
  index("./home.tsx"),
  layout("./auth-layout.tsx", [route("login", "./login.tsx"), route("register", "./register.tsx")]),
  ...prefix("concerts", [index("./concerts/home.tsx"), route(":city", "./concerts/city.tsx")]),
  route("files/*", "./files.tsx"),
] satisfies RouteConfig;
