import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/cookies";

const B = (process.env.BACKEND_URL || "").replace(/\/$/, "");

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const forwardUrl = new URL(req.nextUrl);
  const mode = forwardUrl.searchParams.get("status");
  forwardUrl.searchParams.delete("status");
  const qs = forwardUrl.searchParams.toString();
  const qsSuffix = qs ? `?${qs}` : "";
  const backendPath =
    mode === "published"
      ? `/api/grids/code/${encodeURIComponent(code)}/published-schedule/${qsSuffix}`
      : `/api/grids/code/${encodeURIComponent(code)}/schedule/${qsSuffix}`;

  const res = await fetch(`${B}${backendPath}`, {
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
