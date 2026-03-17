import { NextResponse } from "next/server";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN = process.env.AUTH_COOKIE_DOMAIN;
const SECURE = String(process.env.AUTH_COOKIE_SECURE) === "true";

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: SECURE,
  path: "/",
} as const;
const withDomain = <T extends Record<string, any>>(o: T) => (DOMAIN ? { ...o, domain: DOMAIN } : o);

async function refreshAccess() {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const rf = await fetch(`${process.env.BACKEND_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!rf.ok) return null;
  const tokens = (await rf.json()) as { access: string; refresh?: string };
  return { tokens, refresh };
}

async function callPasswordChange(payload: string, access?: string | null) {
  return fetch(`${process.env.BACKEND_URL}/api/auth/password-change/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: payload,
    cache: "no-store",
  });
}

export async function POST(req: Request) {
  const payload = await req.text();
  const access = await getAccessToken();

  let res = await callPasswordChange(payload, access);
  let refreshedTokens: { access: string; refresh?: string } | null = null;
  let previousRefresh: string | null = null;

  if (res.status === 401) {
    const refreshed = await refreshAccess();
    if (!refreshed) {
      const out = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      out.cookies.delete(ACCESS);
      out.cookies.delete(REFRESH);
      return out;
    }
    refreshedTokens = refreshed.tokens;
    previousRefresh = refreshed.refresh;
    res = await callPasswordChange(payload, refreshed.tokens.access);
  }

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {}

  const responseBody = res.ok
    ? { ok: true, detail: data?.detail || data?.message || "Password updated successfully" }
    : { error: data?.detail || data?.error || text || "Password change failed" };

  const out = NextResponse.json(responseBody, { status: res.status });
  if (refreshedTokens) {
    out.cookies.set(ACCESS, refreshedTokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
    out.cookies.set(REFRESH, refreshedTokens.refresh ?? previousRefresh!, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
  }
  return out;
}
