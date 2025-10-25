// app/api/whoami/route.ts
import { NextResponse } from "next/server";
import { backendFetchJSON } from "@/lib/backend";
import { ApiError } from "@/lib/errors";
import { getRefreshToken } from "@/lib/cookies";
import type { User } from "@/lib/types";

const ACCESS  = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN  = process.env.AUTH_COOKIE_DOMAIN;
const SECURE  = String(process.env.AUTH_COOKIE_SECURE) === "true";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: SECURE,
  domain: DOMAIN,
  path: "/",
};

export async function GET() {
  try {
    const me = await backendFetchJSON<User>("/api/auth/whoami/");
    return NextResponse.json(me);

  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      const refresh = await getRefreshToken();
      if (!refresh) {
        const out = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
        out.cookies.delete(ACCESS);
        out.cookies.delete(REFRESH);
        return out;
      }

      const res = await fetch(`${process.env.BACKEND_URL}/api/auth/refresh/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refresh }),
        cache: "no-store",
      });

      if (!res.ok) {
        const out = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
        out.cookies.delete(ACCESS);
        out.cookies.delete(REFRESH);
        return out;
      }

      const tokens = (await res.json()) as { access: string; refresh?: string };

      // reintento MANUAL con el nuevo access
      const retry = await fetch(`${process.env.BACKEND_URL}/api/auth/whoami/`, {
        headers: { Authorization: `Bearer ${tokens.access}` },
        cache: "no-store",
      });

      if (!retry.ok) {
        const out = NextResponse.json({ error: "retry_failed" }, { status: retry.status });
        out.cookies.set(ACCESS, tokens.access, { ...cookieOptions, maxAge: 60 * 15 });
        out.cookies.set(REFRESH, tokens.refresh ?? refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
        return out;
      }

      const me2 = await retry.json();
      const out = NextResponse.json(me2);
      out.cookies.set(ACCESS, tokens.access, { ...cookieOptions, maxAge: 60 * 15 });
      out.cookies.set(REFRESH, tokens.refresh ?? refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
      return out;
    }

    const err = e as any;
    return NextResponse.json({ error: err?.message || "error" }, { status: err?.status || 500 });
  }
}
