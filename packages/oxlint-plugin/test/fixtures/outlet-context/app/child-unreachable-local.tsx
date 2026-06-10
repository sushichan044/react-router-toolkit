import { useOutletContext } from "react-router";

export default function ChildUnreachableLocal() {
  const context = useOutletContext();
  return context;
}
