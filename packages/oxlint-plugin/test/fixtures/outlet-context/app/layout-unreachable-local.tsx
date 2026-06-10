import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

// A non-exported local component the default export never renders. Its <Outlet> is dead code, so it
// is ignored: child routes do not inherit anything from it.
function NeverUsed() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}

export default function LayoutUnreachableLocal() {
  return <div>no outlet here</div>;
}
