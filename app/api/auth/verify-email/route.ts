import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-base";

export async function POST(req: Request) {
  const payload = await req.text();
  const res = await fetch(`${getApiBaseUrl()}/api/auth/verify-email/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      // fall through to generic response
    }
  }

  return NextResponse.json({ ok: res.ok, detail: text || "Request processed" }, { status: res.status });
}




