import InviteTokenView from "@/components/auth/InviteTokenView";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp?.token || "";
  return <InviteTokenView token={token} />;
}
