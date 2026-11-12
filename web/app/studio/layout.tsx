import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Studio · Bespoke",
  description: "Describe the garment you want in English or Hinglish, pin pictures on a moodboard, and get a tailor sheet in English or Hindi.",
  alternates: { canonical: "/studio/" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
