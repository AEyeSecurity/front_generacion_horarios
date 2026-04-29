// app/api/grids/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id === "undefined") {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing or invalid grid id in route param." },
      { status: 400 }
    );
  }

  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const del = async (token: string) => {
    const headers: HeadersInit = {
      Authorization: `Bearer ${token}`,
      // mirror browser cookies to backend in case it's used for context
      cookie: req.headers.get("cookie") || "",
    };
    // DRF suele aceptar con y sin slash; probamos ambos
    let res = await fetch(`${B}/api/grids/${id}/`, { method: "DELETE", headers, cache: "no-store" });
    if (res.status === 404) {
      res = await fetch(`${B}/api/grids/${id}`, { method: "DELETE", headers, cache: "no-store" });
    }
    return res;
  };

  let res = await del(access);
  if (res.status !== 401) {
    if (res.ok || res.status === 204 || res.status === 404) {
      // Normalize to a simple success JSON so the client doesn't choke on 204/empty body.
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    const body = await res.text().catch(() => "");
    return new NextResponse(body, { status: res.status });
  }

  const refresh = await getRefreshToken();
  if (!refresh) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const rf = await fetch(`${B}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!rf.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 401 });

  const { access: newAccess } = await rf.json();
  res = await del(newAccess);
  if (res.ok || res.status === 204 || res.status === 404) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  const body = await res.text().catch(() => "");
  return new NextResponse(body, { status: res.status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id === "undefined") {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing or invalid grid id in route param." },
      { status: 400 }
    );
  }

  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const headers: HeadersInit = {
    Authorization: `Bearer ${access}`,
    cookie: req.headers.get("cookie") || "",
  };

  let res: Response;
  try {
    res = await fetch(`${B}/api/grids/${id}/`, { headers, cache: "no-store" });
    if (res.status === 404) {
      res = await fetch(`${B}/api/grids/${id}`, { headers, cache: "no-store" });
    }
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  if (res.status === 401) {
    const refresh = await getRefreshToken();
    if (!refresh) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    const rf = await fetch(`${B}/api/auth/refresh/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });
    if (!rf.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 401 });

    const { access: newAccess } = await rf.json();
    const retryHeaders: HeadersInit = {
      Authorization: `Bearer ${newAccess}`,
      cookie: req.headers.get("cookie") || "",
    };
    try {
      res = await fetch(`${B}/api/grids/${id}/`, { headers: retryHeaders, cache: "no-store" });
      if (res.status === 404) {
        res = await fetch(`${B}/api/grids/${id}`, { headers: retryHeaders, cache: "no-store" });
      }
    } catch {
      return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
    }
  }

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id === "undefined") {
    return NextResponse.json(
      { error: "bad_request", detail: "Missing or invalid grid id in route param." },
      { status: 400 }
    );
  }

  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = await req.text();
  const headers: HeadersInit = {
    Authorization: `Bearer ${access}`,
    "content-type": "application/json",
    cookie: req.headers.get("cookie") || "",
  };

  let res: Response;
  try {
    res = await fetch(`${B}/api/grids/${id}/`, {
      method: "PATCH",
      headers,
      body,
      cache: "no-store",
    });
    if (res.status === 404) {
      res = await fetch(`${B}/api/grids/${id}`, {
        method: "PATCH",
        headers,
        body,
        cache: "no-store",
      });
    }
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
  }

  if (res.status === 401) {
    const refresh = await getRefreshToken();
    if (!refresh) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

    const rf = await fetch(`${B}/api/auth/refresh/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });
    if (!rf.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 401 });

    const { access: newAccess } = await rf.json();
    const retryHeaders: HeadersInit = {
      Authorization: `Bearer ${newAccess}`,
      "content-type": "application/json",
      cookie: req.headers.get("cookie") || "",
    };
    try {
      res = await fetch(`${B}/api/grids/${id}/`, {
        method: "PATCH",
        headers: retryHeaders,
        body,
        cache: "no-store",
      });
      if (res.status === 404) {
        res = await fetch(`${B}/api/grids/${id}`, {
          method: "PATCH",
          headers: retryHeaders,
          body,
          cache: "no-store",
        });
      }
    } catch {
      return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
    }
  }

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}
