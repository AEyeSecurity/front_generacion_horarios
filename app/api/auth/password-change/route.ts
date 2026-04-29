import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-base";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";
import { canChangePassword } from "@/lib/account";

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
const withDomain = <T extends Record<string, unknown>>(o: T) => (DOMAIN ? { ...o, domain: DOMAIN } : o);

async function refreshAccess() {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const rf = await fetch(`${getApiBaseUrl()}/api/auth/refresh/`, {
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
  return fetch(`${getApiBaseUrl()}/api/auth/password-change/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: payload,
    cache: "no-store",
  });
}

async function callWhoAmI(access?: string | null) {
  return fetch(`${getApiBaseUrl()}/api/auth/whoami/`, {
    headers: {
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    cache: "no-store",
  });
}

export async function POST(req: Request) {
  const payload = await req.text();
  const access = await getAccessToken();
  if (!access) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let activeAccess = access;
  let refreshedTokens: { access: string; refresh?: string } | null = null;
  let previousRefresh: string | null = null;

  let whoRes = await callWhoAmI(activeAccess);
  if (whoRes.status === 401) {
    const refreshed = await refreshAccess();
    if (!refreshed) {
      const out = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      out.cookies.delete(ACCESS);
      out.cookies.delete(REFRESH);
      return out;
    }
    refreshedTokens = refreshed.tokens;
    previousRefresh = refreshed.refresh;
    activeAccess = refreshed.tokens.access;
    whoRes = await callWhoAmI(activeAccess);
  }

  if (!whoRes.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: whoRes.status || 401 });
  }

  const me = await whoRes.json().catch(() => ({}));
  if (!canChangePassword(me)) {
    const out = NextResponse.json(
      { error: "Google accounts must change password in Google." },
      { status: 403 }
    );
    if (refreshedTokens) {
      out.cookies.set(ACCESS, refreshedTokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
      out.cookies.set(REFRESH, refreshedTokens.refresh ?? previousRefresh!, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
    }
    return out;
  }

  let res = await callPasswordChange(payload, activeAccess);

  if (res.status === 401) {
    if (refreshedTokens) {
      const out = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      out.cookies.delete(ACCESS);
      out.cookies.delete(REFRESH);
      return out;
    }
    const refreshedAgain = await refreshAccess();
    if (!refreshedAgain) {
      const out = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      out.cookies.delete(ACCESS);
      out.cookies.delete(REFRESH);
      return out;
    }
    refreshedTokens = refreshedAgain.tokens;
    previousRefresh = refreshedAgain.refresh;
    res = await callPasswordChange(payload, refreshedAgain.tokens.access);
  }

  const text = await res.text().catch(() => "");
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object") {
      data = parsed as Record<string, unknown>;
    }
  } catch {}

  const detail = typeof data.detail === "string" ? data.detail : undefined;
  const apiError = typeof data.error === "string" ? data.error : undefined;
  const apiMessage = typeof data.message === "string" ? data.message : undefined;

  const responseBody = res.ok
    ? { ok: true, detail: detail || apiMessage || "Password updated successfully" }
    : { error: detail || apiError || text || "Password change failed" };

  const out = NextResponse.json(responseBody, { status: res.status });
  if (refreshedTokens) {
    out.cookies.set(ACCESS, refreshedTokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
    out.cookies.set(REFRESH, refreshedTokens.refresh ?? previousRefresh!, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
  }
  return out;
}
