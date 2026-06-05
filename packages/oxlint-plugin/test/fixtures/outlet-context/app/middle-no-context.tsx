import { Outlet } from "react-router";

// A layout nested under `layout.tsx` (which passes ShopContext) that renders a bare <Outlet>.
// Its children must NOT inherit ShopContext: the nearest Outlet passes nothing, so context is
// undefined here.
export default function MiddleNoContext() {
  return <Outlet />;
}
