import type { Metadata } from "next";
import { Gate } from "../../components/market/Gate";

export const metadata: Metadata = { title: "Requests · Bespoke" };

export default function Page() {
  return <Gate door="customer" />;
}
