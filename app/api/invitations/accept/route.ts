import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const access = await getAccessToken();

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (access) headers.Authorization = `Bearer ${access}`;

  let res = await fetch(`${B}/api/invitations/accept/`, {
    method: "POST",
    headers,
    body: payload,
    cache: "no-store",
  });

  // Alias fallback
  if (res.status === 404) {
    res = await fetch(`${B}/api/invitations/accept-link/`, {
      method: "POST",
      headers,
      body: payload,
      cache: "no-store",
    });
  }

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
