import { Outlet } from "react-router";

export async function loader() {
  return { ok: true };
}

export default function OutletAndLoaderRoute() {
  return <Outlet />;
}
