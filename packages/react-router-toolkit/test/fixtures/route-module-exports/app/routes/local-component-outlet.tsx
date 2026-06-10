import { Outlet } from "react-router";

function Inner() {
  return <Outlet />;
}

export default function LocalComponentOutletRoute() {
  return <Inner />;
}
