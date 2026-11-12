import type { Metadata } from "next";
import { Gate } from "../../components/market/Gate";

export const metadata: Metadata = { title: "For makers · Bespoke", description: "Receive finished designs from customers, flag what is missing, and talk in one thread." };

export default function Page() {
  return <Gate door="maker" />;
}
