import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LandingPage from "@/components/site/LandingPage";
import { headers } from "next/headers";
import { normalizePreferredLanguage } from "@/lib/language";

export default async function RootEntryPage() {
  const me = await getCurrentUser();
  if (me) redirect("/dashboard");
  const h = await headers();
  const language = normalizePreferredLanguage(h.get("accept-language"));
  return <LandingPage language={language} />;
}
