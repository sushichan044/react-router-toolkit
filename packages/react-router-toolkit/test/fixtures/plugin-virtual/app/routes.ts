import { route, type RouteConfig } from "@react-router/dev/routes";
// `virtual:toolkit-test` is supplied by a caller-injected Vite plugin at evaluation time.
import { extraPath } from "virtual:toolkit-test";

export default [route(extraPath, "home.tsx")] satisfies RouteConfig;
