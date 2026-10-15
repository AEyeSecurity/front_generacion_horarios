import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });

  const body = await req.text().catch(() => "");
  const res = await fetch(`${B}/api/grids/code/${encodeURIComponent(code)}/schedule/publish/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "content-type": req.headers.get("content-type") ?? "application/json",
      cookie: req.headers.get("cookie") || "",
    },
    body: body || undefined,
    cache: "no-store",
  });

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
