// Proxy: /api/category_values -> NEXT_PUBLIC_API_URL/api/category-values
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

// GET /api/category_values?category=<id>
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const access = await getAccessToken();
  const headers: Record<string, string> = {};
  if (access) headers["Authorization"] = `Bearer ${access}`;
  const res = await fetch(`${B}/api/category-values/${qs ? `?${qs}` : ""}`, { cache: "no-store", headers });
  const body = await res.text().catch(() => "");
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

// POST /api/category_values  { category, name }
export async function POST(req: NextRequest) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.text();
  const res = await fetch(`${B}/api/category-values/`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${access}` },
    body,
    cache: "no-store",
  });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
