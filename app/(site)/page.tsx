import { getCurrentUser } from "@/lib/auth";
import LandingPage from "@/components/site/LandingPage";
import { headers } from "next/headers";
import { normalizePreferredLanguage } from "@/lib/language";

export default async function RootEntryPage() {
  const me = await getCurrentUser();
  const h = await headers();
  const language = normalizePreferredLanguage(me?.preferred_language ?? h.get("accept-language"));
  return <LandingPage language={language} />;
}
