import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });

  const viewRaw = req.nextUrl.searchParams.get("view");
  const view = viewRaw === "published" ? "published" : "draft";
  const passthroughParams = new URLSearchParams(req.nextUrl.searchParams);
  passthroughParams.set("view", view);

  const res = await fetch(
    `${B}/api/grids/code/${encodeURIComponent(code)}/schedule/export/?${passthroughParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${access}`,
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return NextResponse.json(apiErrorPayload({ error: txt || "export_failed" }, res.status), { status: res.status });
  }

  const buf = await res.arrayBuffer();
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  const cd = res.headers.get("content-disposition");
  if (ct) headers.set("content-type", ct);
  if (cd) headers.set("content-disposition", cd);

  return new NextResponse(buf, { status: res.status, headers });
}
