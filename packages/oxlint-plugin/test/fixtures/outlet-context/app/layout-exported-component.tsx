import { Outlet } from "react-router";

export type ShopContext = { shopId: string };

// The <Outlet> lives in an exported component, not the default export. React Router renders the
// default export, so this Outlet never passes context to child routes.
export function ExportedSection() {
  return <Outlet context={{ shopId: "shop_1" } satisfies ShopContext} />;
}

export default function LayoutExportedComponent() {
  return <div>no outlet here</div>;
}
