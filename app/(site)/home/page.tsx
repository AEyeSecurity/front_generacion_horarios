import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LandingPage from "@/components/site/LandingPage";

export default async function HomeLandingPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/");
  return <LandingPage />;
}
