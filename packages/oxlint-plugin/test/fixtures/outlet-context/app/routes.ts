import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("layout.tsx", [
    index("child.tsx"),
    route("wrong", "child-wrong.tsx"),
    // Nested layout that renders a bare <Outlet>: its child's nearest Outlet passes no context,
    // so the child must resolve to undefined, not the grandparent's ShopContext.
    layout("middle-no-context.tsx", [route("grandchild", "grandchild.tsx")]),
  ]),
  layout("layout-no-context.tsx", [
    route("other", "other.tsx"),
    // `shared.tsx` is registered twice with different parents (explicit ids avoid the duplicate
    // route id error). The bare registration is enumerated first on purpose: rules must aggregate
    // every registration instead of taking the first match.
    route("shared-bare", "shared.tsx", { id: "shared-under-bare" }),
  ]),
  // Outlet placement variants: the parent renders <Outlet> from different locations, which decides
  // whether the child inherits context (see type-safe-outlet-context).
  layout("layout-exported-component.tsx", [route("exported", "child-exported-component.tsx")]),
  layout("layout-local-component.tsx", [
    route("local", "child-local-component.tsx"),
    route("shared-typed", "shared.tsx", { id: "shared-under-typed" }),
  ]),
  layout("layout-unreachable-local.tsx", [route("unreachable", "child-unreachable-local.tsx")]),
] satisfies RouteConfig;
