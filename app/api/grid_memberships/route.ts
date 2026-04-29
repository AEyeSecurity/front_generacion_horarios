import { NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getRefreshToken, getAccessToken } from "@/lib/cookies";
const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN = process.env.AUTH_COOKIE_DOMAIN;
const SECURE = String(process.env.AUTH_COOKIE_SECURE) === "true";
const baseCookie = { httpOnly: true, sameSite: "lax" as const, secure: SECURE, path: "/" } as const;
const withDomain = <T extends Record<string, any>>(o: T) => (DOMAIN ? { ...o, domain: DOMAIN } : o);
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const base = getApiBaseUrlNormalized();
  const access = await getAccessToken();
  const headers: HeadersInit | undefined = access ? { Authorization: `Bearer ${access}` } : undefined;
  // First try canonical path
  let r = await fetch(`${base}/api/grid-memberships/${qs ? `?${qs}` : ""}`, { cache: "no-store", headers });
  if (r.ok || r.status !== 401) {
    const text = await r.text().catch(() => "");
    return new NextResponse(text, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
  }
  // Refresh on 401 and retry
  const refresh = await getRefreshToken();
  if (!refresh) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const rf = await fetch(`${base}/api/auth/refresh/`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh }), cache: "no-store",
  });
  if (!rf.ok) return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
  const tokens = (await rf.json()) as { access: string; refresh?: string };
  // Retry once
  r = await fetch(`${base}/api/grid-memberships/${qs ? `?${qs}` : ""}`, { cache: "no-store", headers: { Authorization: `Bearer ${tokens.access}` } });
  const text = await r.text().catch(() => "");
  const out = new NextResponse(text, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
  out.cookies.set(ACCESS, tokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
  out.cookies.set(REFRESH, tokens.refresh ?? refresh, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
  return out;
}
