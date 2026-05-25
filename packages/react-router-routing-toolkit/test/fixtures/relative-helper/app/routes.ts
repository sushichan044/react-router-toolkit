import { relative, type RouteConfig } from "@react-router/dev/routes";

const { index, route } = relative(import.meta.dirname);

export default [index("./home.tsx"), route("about", "./about.tsx")] satisfies RouteConfig;
