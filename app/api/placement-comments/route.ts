import { NextResponse } from "next/server";
import { getRefreshToken } from "@/lib/cookies";

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN = process.env.AUTH_COOKIE_DOMAIN;
const SECURE = String(process.env.AUTH_COOKIE_SECURE) === "true";

const baseCookie = { httpOnly: true, sameSite: "lax" as const, secure: SECURE, path: "/" } as const;
const withDomain = <T extends Record<string, unknown>>(o: T) => (DOMAIN ? { ...o, domain: DOMAIN } : o);

async function refreshTokens() {
  const refresh = await getRefreshToken();
  if (!refresh) return { error: "unauthenticated" as const };
  const rf = await fetch(`${process.env.BACKEND_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!rf.ok) return { error: "refresh_failed" as const };
  const tokens = (await rf.json()) as { access: string; refresh?: string };
  return { tokens, refresh };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  let r = await fetch(
    `${process.env.BACKEND_URL}/api/placement-comments/${qs ? `?${qs}` : ""}`,
    { cache: "no-store" },
  );
  if (r.ok) return NextResponse.json(await r.json(), { status: r.status });
  if (r.status !== 401) {
    const text = await r.text().catch(() => "error");
    return NextResponse.json({ error: text }, { status: r.status });
  }

  const refreshed = await refreshTokens();
  if ("error" in refreshed) {
    const out = NextResponse.json({ error: refreshed.error }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const { tokens, refresh } = refreshed;
  r = await fetch(
    `${process.env.BACKEND_URL}/api/placement-comments/${qs ? `?${qs}` : ""}`,
    {
      headers: { Authorization: `Bearer ${tokens.access}` },
      cache: "no-store",
    },
  );
  const data = await r.json().catch(() => ({}));
  const out = NextResponse.json(data, { status: r.status });
  out.cookies.set(ACCESS, tokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
  out.cookies.set(REFRESH, tokens.refresh ?? refresh!, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
  return out;
}

export async function POST(req: Request) {
  const body = await req.text();
  let r = await fetch(`${process.env.BACKEND_URL}/api/placement-comments/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });
  if (r.ok) return NextResponse.json(await r.json(), { status: r.status });
  if (r.status !== 401) {
    const txt = await r.text().catch(() => "");
    let detail: unknown = txt;
    try { detail = JSON.parse(txt); } catch {}
    return NextResponse.json(detail, { status: r.status });
  }

  const refreshed = await refreshTokens();
  if ("error" in refreshed) {
    const out = NextResponse.json({ error: refreshed.error }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const { tokens, refresh } = refreshed;
  r = await fetch(`${process.env.BACKEND_URL}/api/placement-comments/`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${tokens.access}` },
    body,
    cache: "no-store",
  });
  const text = await r.text().catch(() => "");
  let data: unknown = text;
  try { data = JSON.parse(text); } catch {}
  const out = NextResponse.json(data, { status: r.status });
  out.cookies.set(ACCESS, tokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
  out.cookies.set(REFRESH, tokens.refresh ?? refresh!, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
  return out;
}
