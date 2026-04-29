import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";

const B = getApiBaseUrlNormalized();

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  let res = await fetch(`${B}/api/invitations/resolve/?token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });

  // Alias fallback
  if (res.status === 404) {
    res = await fetch(`${B}/api/invitations/resolve-link/?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
  }

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
