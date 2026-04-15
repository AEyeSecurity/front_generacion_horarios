import { NextResponse } from "next/server";
import { getAccessToken, getRefreshToken } from "@/lib/cookies";
import { normalizePreferredLanguage } from "@/lib/language";

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

const withDomain = <T extends Record<string, unknown>>(value: T) => (DOMAIN ? { ...value, domain: DOMAIN } : value);

type RefreshPayload = { access: string; refresh?: string };

async function refreshTokens(): Promise<{ tokens: RefreshPayload; refresh: string } | null> {
  const refresh = await getRefreshToken();
  if (!refresh) return null;
  const res = await fetch(`${process.env.BACKEND_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const tokens = (await res.json()) as RefreshPayload;
  if (!tokens?.access) return null;
  return { tokens, refresh };
}

async function callWhoAmI(access: string, method: "GET" | "PATCH" | "PUT", payload?: unknown) {
  return fetch(`${process.env.BACKEND_URL}/api/auth/whoami/`, {
    method,
    headers: {
      Authorization: `Bearer ${access}`,
      ...(method === "GET" ? {} : { "content-type": "application/json" }),
    },
    body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
    cache: "no-store",
  });
}

async function responseJsonOrError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function applyAuthCookies(
  response: NextResponse,
  tokens: RefreshPayload | null,
  refresh: string | null,
): NextResponse {
  if (!tokens || !refresh) return response;
  response.cookies.set(ACCESS, tokens.access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
  response.cookies.set(REFRESH, tokens.refresh ?? refresh, withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 }));
  return response;
}

async function proxyWhoAmI(method: "GET" | "PATCH" | "PUT", payload?: unknown) {
  let access = await getAccessToken();
  let refreshedTokens: RefreshPayload | null = null;
  let previousRefresh: string | null = null;

  if (!access) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      const out = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      out.cookies.delete(ACCESS);
      out.cookies.delete(REFRESH);
      return out;
    }
    access = refreshed.tokens.access;
    refreshedTokens = refreshed.tokens;
    previousRefresh = refreshed.refresh;
  }

  let res = await callWhoAmI(access, method, payload);
  if (!res.ok && res.status === 401) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      const out = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
      out.cookies.delete(ACCESS);
      out.cookies.delete(REFRESH);
      return out;
    }
    access = refreshed.tokens.access;
    refreshedTokens = refreshed.tokens;
    previousRefresh = refreshed.refresh;
    res = await callWhoAmI(access, method, payload);
  }

  if (method === "PATCH" && !res.ok && res.status === 405) {
    // Backend may expose PUT but not PATCH on whoami.
    res = await callWhoAmI(access, "PUT", payload);
  }

  const data = await responseJsonOrError(res);
  const out = NextResponse.json(data, { status: res.status });
  return applyAuthCookies(out, refreshedTokens, previousRefresh);
}

export async function GET() {
  return proxyWhoAmI("GET");
}

export async function PATCH(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const candidate = raw.preferred_language ?? raw.language;
  const preferred_language = normalizePreferredLanguage(candidate);
  return proxyWhoAmI("PATCH", { preferred_language });
}

export async function PUT(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const candidate = raw.preferred_language ?? raw.language;
  const preferred_language = normalizePreferredLanguage(candidate);
  return proxyWhoAmI("PUT", { preferred_language });
}
