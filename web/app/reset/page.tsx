import type { Metadata } from "next";
import { ResetPage } from "../../components/market/ResetPage";

export const metadata: Metadata = { title: "Set a new password · Bespoke", robots: { index: false } };

export default function Page() {
  return <ResetPage />;
}
