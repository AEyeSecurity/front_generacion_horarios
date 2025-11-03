import { NextResponse } from "next/server";

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN = process.env.AUTH_COOKIE_DOMAIN;
const SECURE = String(process.env.AUTH_COOKIE_SECURE) === "true";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: SECURE,
  domain: DOMAIN,
  path: "/",
};

export async function POST(req: Request) {
  const body = await req.text();
  const res = await fetch(`${process.env.BACKEND_URL}/api/auth/google/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  let data: any = text; try { data = JSON.parse(text); } catch {}

  if (!res.ok) {
    // Normalize errors to a clean JSON shape
    let message = "Google login failed";
    if (typeof data === "string") message = text.slice(0, 500) || message;
    else message = data?.error || data?.detail || data?.code || message;

    return NextResponse.json(
      { error: message, status: res.status, raw: typeof data === "string" ? text.slice(0, 200) : undefined, ...(
        typeof data === "object" ? data : {}
      ) },
      { status: res.status }
    );
  }

  // Success → set cookies with tokens
  const out = NextResponse.json({ ok: true }, { status: 200 });
  if (data?.access) out.cookies.set(ACCESS, data.access, { ...cookieOptions, maxAge: 60 * 15 });
  if (data?.refresh) out.cookies.set(REFRESH, data.refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
  return out;
}
