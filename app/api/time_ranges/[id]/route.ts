// Proxy: /api/time_ranges/:id -> BACKEND /api/time-ranges/:id
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

async function refreshAccessToken() {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const rf = await fetch(`${B}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!rf.ok) return null;
  const parsed = (await rf.json().catch(() => ({}))) as { access?: string };
  return parsed.access ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let res: Response;
  try {
    res = await fetch(`${B}/api/time-ranges/${id}/`, { headers: { Authorization: `Bearer ${access}`, cookie: req.headers.get("cookie") || "" }, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }
  if (res.status === 401) {
    const newAccess = await refreshAccessToken();
    if (!newAccess) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    try {
      res = await fetch(`${B}/api/time-ranges/${id}/`, { headers: { Authorization: `Bearer ${newAccess}`, cookie: req.headers.get("cookie") || "" }, cache: "no-store" });
    } catch {
      return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
    }
  }
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.text();
  let res: Response;
  try {
    res = await fetch(`${B}/api/time-ranges/${id}/`, { method: "PATCH", headers: { Authorization: `Bearer ${access}`, "content-type": "application/json", cookie: req.headers.get("cookie") || "" }, body, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }
  if (res.status === 401) {
    const newAccess = await refreshAccessToken();
    if (!newAccess) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    try {
      res = await fetch(`${B}/api/time-ranges/${id}/`, { method: "PATCH", headers: { Authorization: `Bearer ${newAccess}`, "content-type": "application/json", cookie: req.headers.get("cookie") || "" }, body, cache: "no-store" });
    } catch {
      return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
    }
  }
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let res: Response;
  try {
    res = await fetch(`${B}/api/time-ranges/${id}/`, { method: "DELETE", headers: { Authorization: `Bearer ${access}`, cookie: req.headers.get("cookie") || "" }, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }
  if (res.status === 401) {
    const newAccess = await refreshAccessToken();
    if (!newAccess) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    try {
      res = await fetch(`${B}/api/time-ranges/${id}/`, { method: "DELETE", headers: { Authorization: `Bearer ${newAccess}`, cookie: req.headers.get("cookie") || "" }, cache: "no-store" });
    } catch {
      return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
    }
  }
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "text/plain" } });
}
