import { Outlet } from "react-router";

export default function NestedHelperOutletRoute() {
  function NeverRendered() {
    return <Outlet />;
  }

  return <div>no outlet here</div>;
}
