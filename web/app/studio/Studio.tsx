"use client";
// One studio for every studio page: it lives in the layout, so moving between Talk, Board, Sheet and Shop keeps it mounted.
import dynamic from "next/dynamic";

const App = dynamic(() => import("../../components/App"), { ssr: false });

export function Studio() {
  return <App />;
}
