import { NextResponse } from "next/server";

const HTML_PREFIXES = ["<!doctype html", "<html", "&lt;!doctype html", "&lt;html"];

function isHtmlResponse(body: string, contentType: string): boolean {
  const normalizedType = contentType.toLowerCase();
  const normalizedBody = body.trimStart().slice(0, 160).toLowerCase();
  return normalizedType.includes("text/html") || HTML_PREFIXES.some((prefix) => normalizedBody.startsWith(prefix));
}

export async function forwardApiResponse(response: Promise<Response>): Promise<NextResponse> {
  try {
    const upstream = await response;
    const body = await upstream.text().catch(() => "");
    const contentType = upstream.headers.get("content-type") ?? "";

    if (isHtmlResponse(body, contentType)) {
      return NextResponse.json(
        { code: "UPSTREAM_INVALID_RESPONSE", upstream_status: upstream.status },
        { status: upstream.ok ? 502 : upstream.status },
      );
    }

    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": contentType || "application/json" },
    });
  } catch {
    return NextResponse.json({ code: "UPSTREAM_UNAVAILABLE" }, { status: 502 });
  }
}
