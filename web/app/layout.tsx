import "./globals.css";
import type { Metadata } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";

// Self-hosted at build time: no request to a font service when the page loads.
const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-display", display: "swap" });
const ui = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "Bespoke",
  description: "Describe the garment you want made, in words or pictures, and get a design your tailor can cut from.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`}>
      <body>{children}</body>
    </html>
  );
}
