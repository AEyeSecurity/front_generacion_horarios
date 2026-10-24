import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";
import { forwardApiResponse } from "@/lib/api-proxy-response";

export async function POST(req: NextRequest) {
  const access = await getAccessToken();
  const body = await req.text();
  const base = getApiBaseUrlNormalized();
  let renewed: { access: string; refresh: string } | null = null;
  const call = (token: string | undefined) => fetch(`${base}/api/invitations/revoke-links/`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body, cache: "no-store",
  });
  const out: NextResponse = await forwardApiResponse((async () => {
    const res = await call(access);
    if (res.status !== 401) return res;
    const refresh = await getRefreshToken();
    if (!refresh) return res;
    const refreshed = await fetch(`${base}/api/auth/refresh/`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh }), cache: "no-store",
    });
    if (!refreshed.ok) return res;
    const tokens = await refreshed.json() as { access?: string; refresh?: string };
    if (!tokens.access) return res;
    renewed = { access: tokens.access, refresh: tokens.refresh ?? refresh };
    return call(tokens.access);
  })());
  if (renewed) {
    const tokens = renewed as { access: string; refresh: string };
    const cookie = {
      httpOnly: true, sameSite: "lax" as const, path: "/",
      secure: String(process.env.AUTH_COOKIE_SECURE) === "true",
      ...(process.env.AUTH_COOKIE_DOMAIN ? { domain: process.env.AUTH_COOKIE_DOMAIN } : {}),
    };
    out.cookies.set(process.env.AUTH_ACCESS_COOKIE!, tokens.access, { ...cookie, maxAge: 60 * 15 });
    out.cookies.set(process.env.AUTH_REFRESH_COOKIE!, tokens.refresh, { ...cookie, maxAge: 60 * 60 * 24 * 7 });
  }
  return out;
}
