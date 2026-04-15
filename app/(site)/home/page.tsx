import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LandingPage from "@/components/site/LandingPage";
import { normalizePreferredLanguage } from "@/lib/language";

export default async function HomeLandingPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  const language = normalizePreferredLanguage(me.preferred_language);
  return <LandingPage language={language} />;
}
