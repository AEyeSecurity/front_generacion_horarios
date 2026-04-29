import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-base";

export async function POST(req: Request) {
  const payload = await req.text();
  const res = await fetch(`${getApiBaseUrl()}/api/auth/password-reset/confirm/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    const error =
      data?.detail ||
      data?.error ||
      (typeof data === "string" ? data : "") ||
      text ||
      "Password reset failed";
    return NextResponse.json({ error }, { status: res.status });
  }

  return NextResponse.json(
    {
      ok: true,
      detail: data?.detail || data?.message || "Password updated successfully",
    },
    { status: res.status }
  );
}
