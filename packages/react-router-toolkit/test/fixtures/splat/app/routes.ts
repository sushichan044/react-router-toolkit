import { route, type RouteConfig } from "@react-router/dev/routes";

export default [route("files/*", "files.tsx")] satisfies RouteConfig;
