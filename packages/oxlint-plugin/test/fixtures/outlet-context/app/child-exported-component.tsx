import { useOutletContext } from "react-router";

export default function ChildExportedComponent() {
  const context = useOutletContext();
  return context;
}
