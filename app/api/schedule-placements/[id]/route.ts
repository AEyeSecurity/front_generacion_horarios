import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });
  const body = await req.text();
  const res = await fetch(`${B}/api/schedule-placements/${encodeURIComponent(id)}/`, {
    method: "PATCH",
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });
  const res = await fetch(`${B}/api/schedule-placements/${encodeURIComponent(id)}/`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
