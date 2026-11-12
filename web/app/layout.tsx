import "./globals.css";
import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import { Assistant } from "../components/site/Assistant";
import { Splash } from "../components/site/Splash";
import { ToTop } from "../components/site/ToTop";

// Self-hosted at build time: no request to a font service when the page loads.
const sans = Google_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-ui", display: "swap" });

export const metadata: Metadata = {
  title: "Bespoke",
  authors: [{ name: "Ritesh Roshan" }],
  description: "Describe the garment you want made, in words or pictures, and get a design your tailor can cut from.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body><Splash />{children}<ToTop /><Assistant /></body>
    </html>
  );
}
