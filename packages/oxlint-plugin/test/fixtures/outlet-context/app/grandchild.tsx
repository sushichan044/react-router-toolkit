import { useOutletContext } from "react-router";

export default function Grandchild() {
  const context = useOutletContext();
  return context;
}
