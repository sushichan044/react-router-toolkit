import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("home.tsx"),
  route("about", "about.tsx"),
  route("shops", "shops.tsx", [route(":shop_id", "shop-detail.tsx")]),
] satisfies RouteConfig;
