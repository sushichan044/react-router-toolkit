import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("layout.tsx", [
    index("child.tsx"),
    route("wrong", "child-wrong.tsx"),
    // Nested layout that renders a bare <Outlet>: its child's nearest Outlet passes no context,
    // so the child must resolve to undefined, not the grandparent's ShopContext.
    layout("middle-no-context.tsx", [route("grandchild", "grandchild.tsx")]),
  ]),
  layout("layout-no-context.tsx", [route("other", "other.tsx")]),
] satisfies RouteConfig;
