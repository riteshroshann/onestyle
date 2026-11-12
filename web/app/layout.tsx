import "./globals.css";
import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import { Assistant } from "../components/site/Assistant";
import { Splash } from "../components/site/Splash";
import { ToTop } from "../components/site/ToTop";

// Self-hosted at build time: no request to a font service when the page loads.
const sans = Google_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-ui", display: "swap" });

const SITE = "https://onestyle-tawny.vercel.app";
const DESCRIPTION = "Describe the clothes you want made, in English or Hinglish, typed or spoken. Bespoke turns your words and pictures into a tailor sheet any tailor can follow, and connects you with designers and tailors.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Bespoke · Clothes made from your words",
  description: DESCRIPTION,
  applicationName: "Bespoke",
  authors: [{ name: "Ritesh Roshan" }],
  creator: "Ritesh Roshan",
  keywords: ["custom clothing", "made to measure", "tailor", "tailor sheet", "fashion designer", "boutique", "kurta", "lehenga", "saree blouse", "Hinglish", "AI fashion", "moodboard", "India"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website", url: SITE, siteName: "Bespoke", locale: "en_IN",
    title: "Bespoke · Clothes made from your words", description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Bespoke: Describe it. Wear it." }],
  },
  twitter: { card: "summary_large_image", title: "Bespoke · Clothes made from your words", description: DESCRIPTION, images: ["/og.png"] },
  robots: { index: true, follow: true },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Bespoke",
  url: SITE,
  description: DESCRIPTION,
  applicationCategory: "LifestyleApplication",
  operatingSystem: "Any",
  inLanguage: ["en", "hi"],
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  creator: { "@type": "Person", name: "Ritesh Roshan" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <Splash />{children}<ToTop /><Assistant />
      </body>
    </html>
  );
}
