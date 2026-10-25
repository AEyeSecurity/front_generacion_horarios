import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";
import { forwardApiResponse } from "@/lib/api-proxy-response";
import { apiErrorPayload } from "@/lib/api-error-contract";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ code: "UNAUTHENTICATED" }, 401), { status: 401 });
  const upstream = fetch(`${getApiBaseUrlNormalized()}/api/grids/${encodeURIComponent(id)}/leave/`, {
    method: "POST", headers: { Authorization: `Bearer ${access}` }, cache: "no-store",
  });
  return upstream.then((res) => res.status === 204 ? new NextResponse(null, { status: 204 }) : forwardApiResponse(Promise.resolve(res)),
    () => NextResponse.json(apiErrorPayload({ code: "UPSTREAM_UNAVAILABLE" }, 502), { status: 502 }));
}
