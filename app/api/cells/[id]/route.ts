import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();
const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN = process.env.AUTH_COOKIE_DOMAIN;
const SECURE = String(process.env.AUTH_COOKIE_SECURE) === "true";

const baseCookie = { httpOnly: true, sameSite: "lax" as const, secure: SECURE, path: "/" } as const;
const withDomain = <T extends Record<string, unknown>>(o: T) => (DOMAIN ? { ...o, domain: DOMAIN } : o);

async function refreshTokens() {
  const refresh = await getRefreshToken();
  if (!refresh) return { error: "unauthenticated" as const };
  const rf = await fetch(`${B}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!rf.ok) return { error: "refresh_failed" as const };
  const tokens = (await rf.json()) as { access: string; refresh?: string };
  return { tokens, refresh };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  let res = await fetch(`${B}/api/cells/${id}/`, {
    method: "GET",
    headers: {
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    const refreshed = await refreshTokens();
    if ("error" in refreshed) {
      const out = NextResponse.json({ error: refreshed.error }, { status: 401 });
      out.cookies.delete(ACCESS);
      out.cookies.delete(REFRESH);
      return out;
    }
    const { tokens, refresh } = refreshed;
    res = await fetch(`${B}/api/cells/${id}/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokens.access}`,
        cookie: req.headers.get("cookie") || "",
      },
      cache: "no-store",
    });
    const txt = await res.text().catch(() => "");
    const out = new NextResponse(txt, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
    out.cookies.set(ACCESS, tokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
    out.cookies.set(REFRESH, tokens.refresh ?? refresh!, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
    return out;
  }

  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const body = await req.text();
  const res = await fetch(`${B}/api/cells/${id}/`, {
    method: "PATCH",
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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const res = await fetch(`${B}/api/cells/${id}/`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${access}`,
      cookie: req.headers.get("cookie") || "",
    },
    cache: "no-store",
  });
  const txt = await res.text().catch(() => "");
  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}




