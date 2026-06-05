import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

export default function Layout() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}
