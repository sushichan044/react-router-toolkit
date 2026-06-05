import { useOutletContext } from "react-router";

export default function Child() {
  const context = useOutletContext();
  return context;
}
