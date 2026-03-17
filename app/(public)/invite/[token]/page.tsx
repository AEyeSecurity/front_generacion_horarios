import InviteTokenView from "@/components/auth/InviteTokenView";

export default async function InviteTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteTokenView token={token} />;
}
