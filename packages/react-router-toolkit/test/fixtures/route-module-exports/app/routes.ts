import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/async-loader.tsx"),
  route("arrow-action", "routes/arrow-action.tsx"),
  route("class-component", "routes/class-component.tsx"),
  route("reexported-loader", "routes/reexported-loader.tsx"),
  route("local-reexport", "routes/local-reexport.tsx"),
  route("client-loader-hydrate", "routes/client-loader-hydrate.tsx"),
  route("unknown-export", "routes/unknown-export.tsx"),
  route("default-only", "routes/default-only.tsx"),
  route("multiple-vars", "routes/multiple-vars.tsx"),
  route("outlet-and-loader", "routes/outlet-and-loader.tsx"),
] satisfies RouteConfig;
