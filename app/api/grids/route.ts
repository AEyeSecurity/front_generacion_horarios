// app/api/grids/route.ts
import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-base";
import { ApiError } from "@/lib/errors";
import { backendFetchJSON } from "@/lib/backend";
import { getRefreshToken } from "@/lib/cookies";
import type { ApiList, Grid } from "@/lib/types";

const ACCESS  = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN  = process.env.AUTH_COOKIE_DOMAIN;
const SECURE  = String(process.env.AUTH_COOKIE_SECURE) === "true";

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: SECURE,
  path: "/",
} as const;

const withDomain = <T extends Record<string, any>>(o: T) =>
  DOMAIN ? { ...o, domain: DOMAIN } : o;

// âœ… GET: listar grids
export async function GET() {
  try {
    const data = await backendFetchJSON<ApiList<Grid>>("/api/grids/");
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401)
      return refreshAndRetryJSON("/api/grids/");
    const err = e as any;
    return NextResponse.json({ error: err?.message || "error" }, { status: err?.status || 500 });
  }
}

// âœ… POST: crear nuevo grid
export async function POST(req: Request) {
  const bodyText = await req.text(); // mantener body para reintento

  // --- 1) intento directo ---
  let res = await fetch(`${getApiBaseUrl()}/api/grids/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bodyText,
    cache: "no-store",
  });

  if (res.ok) {
    const created = await res.json();
    return NextResponse.json(created, { status: 201 });
  }

  if (res.status !== 401) {
    const body = await res.text().catch(() => "");
    let detail: any = body;
    try { detail = JSON.parse(body); } catch {}
    return NextResponse.json({ error: "validation", detail }, { status: res.status });
  }

  // --- 2) 401 â†’ refresh y reintento ---
  const refresh = await getRefreshToken();
  if (!refresh) {
    const out = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const rf = await fetch(`${getApiBaseUrl()}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });

  if (!rf.ok) {
    const out = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const { access, refresh: newRefresh } = await rf.json();

  res = await fetch(`${getApiBaseUrl()}/api/grids/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${access}`,
    },
    body: bodyText,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  let data: any = text;
  try { data = JSON.parse(text); } catch {}

  const out = NextResponse.json(data, { status: res.status });
  out.cookies.set(ACCESS, access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
  out.cookies.set(
    REFRESH,
    newRefresh ?? refresh,
    withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 })
  );
  return out;
}

// helper para GET con refresh automÃ¡tico
async function refreshAndRetryJSON(path: string) {
  const refresh = await getRefreshToken();
  if (!refresh) {
    const out = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const rf = await fetch(`${getApiBaseUrl()}/api/auth/refresh/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh }),
    cache: "no-store",
  });

  if (!rf.ok) {
    const out = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const { access, refresh: newRefresh } = await rf.json();

  const retry = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  const data = await retry.json().catch(() => ({}));
  const out = NextResponse.json(data, { status: retry.status });
  out.cookies.set(ACCESS, access, withDomain({ ...baseCookie, maxAge: 60 * 15 }));
  out.cookies.set(
    REFRESH,
    newRefresh ?? refresh,
    withDomain({ ...baseCookie, maxAge: 60 * 60 * 24 * 7 })
  );
  return out;
}




