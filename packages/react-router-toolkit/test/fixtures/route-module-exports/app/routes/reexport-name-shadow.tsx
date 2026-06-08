import { Outlet } from "react-router";

export { Inner } from "./shadow-source";

function Inner() {
  return <Outlet />;
}

export default function ReexportNameShadowRoute() {
  return <Inner />;
}
