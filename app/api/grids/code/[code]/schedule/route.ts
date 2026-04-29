import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const forwardUrl = new URL(req.nextUrl);
  const mode = forwardUrl.searchParams.get("status");
  forwardUrl.searchParams.delete("status");
  const qs = forwardUrl.searchParams.toString();
  const qsSuffix = qs ? `?${qs}` : "";
  const backendPath =
    mode === "published"
      ? `/api/grids/code/${encodeURIComponent(code)}/published-schedule/${qsSuffix}`
      : `/api/grids/code/${encodeURIComponent(code)}/schedule/${qsSuffix}`;

  const res = await fetch(`${B}${backendPath}`, {
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.text();
  const res = await fetch(`${B}/api/grids/code/${encodeURIComponent(code)}/schedule/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "content-type": "application/json",
      cookie: req.headers.get("cookie") || "",
    },
    body: body || "{}",
    cache: "no-store",
  });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}




