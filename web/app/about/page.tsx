import type { Metadata } from "next";
import { AboutPage } from "../../components/about/AboutPage";

export const metadata: Metadata = {
  title: "About · Bespoke",
  description: "Bespoke turns the way people really describe clothes, in English or Hinglish, into a sheet any tailor can follow.",
};

export default function Page() {
  return <AboutPage />;
}
