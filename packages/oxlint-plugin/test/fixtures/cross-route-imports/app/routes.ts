import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [index("home.tsx"), route("about", "about.tsx")] satisfies RouteConfig;
