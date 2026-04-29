import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function GET(req: NextRequest) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const res = await fetch(`${B}/api/schedule-placements/${qs ? `?${qs}` : ""}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.text();
  const res = await fetch(`${B}/api/schedule-placements/`, {
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
