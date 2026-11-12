import type { Metadata } from "next";
import { Studio } from "./Studio";

export const metadata: Metadata = {
  title: "Studio · Bespoke",
  description: "Describe the garment you want in English or Hinglish, pin pictures on a moodboard, and get a tailor sheet in English or Hindi.",
  alternates: { canonical: "/studio/talk/" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><Studio />{children}</>;
}
