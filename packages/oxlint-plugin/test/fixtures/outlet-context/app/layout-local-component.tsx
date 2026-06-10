import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

// A non-exported local component that the default export renders. Its <Outlet> is the route's
// outlet, so child routes inherit ShopContext.
function Inner() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}

export default function LayoutLocalComponent() {
  return <Inner />;
}
