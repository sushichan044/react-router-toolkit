import { useOutletContext } from "react-router";

export default function Other() {
  const context = useOutletContext();
  return context;
}
