import { redirect } from "next/navigation";

export default async function TimeRangesPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/grid/${encodeURIComponent(code)}/settings`);
}
