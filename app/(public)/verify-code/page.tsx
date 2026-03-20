import { redirect } from "next/navigation";

export default async function VerifyCodePage({
  searchParams,
}: {
  searchParams: Promise<{ verify_code?: string; code?: string; uid?: string; token?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  if (sp.verify_code) q.set("verify_code", sp.verify_code);
  if (sp.code) q.set("code", sp.code);
  if (sp.uid) q.set("uid", sp.uid);
  if (sp.token) q.set("token", sp.token);
  if (sp.next) q.set("next", sp.next);
  const qs = q.toString();
  redirect(`/verify-email/confirm${qs ? `?${qs}` : ""}`);
}
