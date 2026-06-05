import { useOutletContext } from "react-router";

export default function ChildLocalComponent() {
  const context = useOutletContext();
  return context;
}
