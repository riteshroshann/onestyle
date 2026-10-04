import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "bespoke",
  description: "Describe what you wish to wear. Bespoke turns your words and your moodboard into a garment a tailor can make.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
