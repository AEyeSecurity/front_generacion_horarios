import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";
import { forwardApiResponse } from "@/lib/api-proxy-response";

const B = getApiBaseUrlNormalized();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; run_id: string }> },
) {
  const { id, run_id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });
  const body = await req.text();
  return forwardApiResponse(fetch(
    `${B}/api/grids/${encodeURIComponent(id)}/solve-candidates/${encodeURIComponent(run_id)}/choose/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "content-type": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body,
      cache: "no-store",
    },
  ));
}
