// Proxy: /api/participants/:id â†’ NEXT_PUBLIC_API_URL/api/participants/:id
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const res = await fetch(`${B}/api/participants/${id}/`, {
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const res = await fetch(`${B}/api/participants/${id}/`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "text/plain" },
  });
}

async function writeParticipant(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>,
  method: "PATCH" | "PUT",
) {
  const { id } = await paramsPromise;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.text();
  const res = await fetch(`${B}/api/participants/${id}/`, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      "content-type": "application/json",
      cookie: req.headers.get("cookie") || "",
    },
    body,
    cache: "no-store",
  });
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return writeParticipant(req, params, "PATCH");
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return writeParticipant(req, params, "PUT");
}





