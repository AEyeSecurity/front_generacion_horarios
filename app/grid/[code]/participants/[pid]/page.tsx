import { redirect } from "next/navigation";

export default async function ParticipantCompatibilityRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; pid: string }>;
  searchParams?: Promise<{ view?: string | string[]; onboarding?: string | string[] }>;
}) {
  const { code, pid } = await params;
  const sp = await searchParams;
  const rawView = Array.isArray(sp?.view) ? sp?.view[0] : sp?.view;
  const rawOnboarding = Array.isArray(sp?.onboarding) ? sp?.onboarding[0] : sp?.onboarding;
  const query = new URLSearchParams();
  query.set("pid", pid);
  query.set("view", rawView === "rules" ? "rules" : "schedule");
  if (rawOnboarding) query.set("onboarding", rawOnboarding);

  redirect(`/grid/${encodeURIComponent(code)}/participants?${query.toString()}`);
}
