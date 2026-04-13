import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/cookies";

const B = (process.env.BACKEND_URL || "").replace(/\/$/, "");

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const viewRaw = req.nextUrl.searchParams.get("view");
  const view = viewRaw === "published" ? "published" : "draft";
  const passthroughParams = new URLSearchParams(req.nextUrl.searchParams);
  passthroughParams.set("view", view);

  const res = await fetch(
    `${B}/api/grids/${encodeURIComponent(id)}/schedule/export/?${passthroughParams.toString()}`,
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
    return NextResponse.json({ error: txt || "export_failed" }, { status: res.status });
  }

  const buf = await res.arrayBuffer();
  const headers = new Headers();
  const ct = res.headers.get("content-type");
  const cd = res.headers.get("content-disposition");
  if (ct) headers.set("content-type", ct);
  if (cd) headers.set("content-disposition", cd);

  return new NextResponse(buf, { status: res.status, headers });
}
