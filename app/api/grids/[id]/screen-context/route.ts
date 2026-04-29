import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

const passthroughHeaders = (res: Response) => {
  const headers = new Headers();
  headers.set("content-type", res.headers.get("content-type") ?? "application/json");
  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");
  const cacheControl = res.headers.get("cache-control");
  if (etag) headers.set("etag", etag);
  if (lastModified) headers.set("last-modified", lastModified);
  if (cacheControl) headers.set("cache-control", cacheControl);
  return headers;
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const qs = req.nextUrl.searchParams.toString();
  const qsSuffix = qs ? `?${qs}` : "";

  const res = await fetch(`${B}/api/grids/${encodeURIComponent(id)}/screen-context/${qsSuffix}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
      "if-none-match": req.headers.get("if-none-match") || "",
      "if-modified-since": req.headers.get("if-modified-since") || "",
    },
    cache: "no-store",
  });

  if (res.status === 304 || res.status === 204) {
    return new NextResponse(null, {
      status: res.status,
      headers: passthroughHeaders(res),
    });
  }

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: passthroughHeaders(res),
  });
}





