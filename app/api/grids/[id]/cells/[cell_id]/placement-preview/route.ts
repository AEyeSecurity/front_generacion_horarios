import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cell_id: string }> },
) {
  const { id, cell_id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });

  const body = await req.text();
  let forwardedBody = body;
  let requestedSplitDuration: number | null = null;
  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    if (payload.mode === "PLACE_UNASSIGNED_CELL" && payload.split_segment === true) {
      requestedSplitDuration = Math.max(1, Math.round(Number(payload.duration_slots)) || 1);
    }
    delete payload.split_segment;
    delete payload.duration_slots;
    forwardedBody = JSON.stringify(payload);
  } catch {
    // Let the backend return the canonical malformed-body response.
  }
  const res = await fetch(
    `${B}/api/grids/${encodeURIComponent(id)}/cells/${encodeURIComponent(cell_id)}/placement-preview/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "content-type": req.headers.get("content-type") || "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: forwardedBody,
      cache: "no-store",
    },
  );

  let txt = await res.text().catch(() => "");
  if (res.ok && requestedSplitDuration != null) {
    try {
      const payload = JSON.parse(txt) as Record<string, unknown>;
      payload.duration_slots = requestedSplitDuration;
      txt = JSON.stringify(payload);
    } catch {
      // Preserve the upstream response if it is unexpectedly not JSON.
    }
  }
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

