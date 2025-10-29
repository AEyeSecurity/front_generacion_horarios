// Proxy: /api/availability_rules/:id → BACKEND_URL/api/availability-rules/:id
import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/cookies";

const B = (process.env.BACKEND_URL || "").replace(/\/$/, "");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const res = await fetch(`${B}/api/availability-rules/${params.id}/`, {
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });

  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.text();
  const res = await fetch(`${B}/api/availability-rules/${params.id}/`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    body,
  });

  return new NextResponse(await res.text(), {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const res = await fetch(`${B}/api/availability-rules/${params.id}/`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
  });

  return new NextResponse(await res.text(), { status: res.status });
}
