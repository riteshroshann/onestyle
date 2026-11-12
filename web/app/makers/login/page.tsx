import type { Metadata } from "next";
import { AuthPage } from "../../../components/market/AuthPage";

export const metadata: Metadata = { title: "Log in · Bespoke" };

export default function Page() {
  return <AuthPage role="maker" mode="login" />;
}
