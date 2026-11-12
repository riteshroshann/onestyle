import type { Metadata } from "next";
import { AuthPage } from "../../components/market/AuthPage";

export const metadata: Metadata = { title: "Create account · Bespoke" };

export default function Page() {
  return <AuthPage role="customer" mode="signup" />;
}
