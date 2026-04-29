import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.text();
  const res = await fetch(`${B}/api/grids/${encodeURIComponent(id)}/precheck/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "content-type": "application/json",
      cookie: req.headers.get("cookie") || "",
    },
    body,
    cache: "no-store",
  });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}





