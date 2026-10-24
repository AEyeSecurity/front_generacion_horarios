import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

export async function GET(req: NextRequest) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ detail: "Authentication required." }, { status: 401 });
  const res = await fetch(`${getApiBaseUrlNormalized()}/api/participants/duplicate-check/?${req.nextUrl.searchParams}`, {
    headers: { Authorization: `Bearer ${access}` }, cache: "no-store",
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
