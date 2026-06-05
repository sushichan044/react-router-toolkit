import { useOutletContext } from "react-router";

export default function ChildWrong() {
  const context = useOutletContext<number>();
  return context;
}
