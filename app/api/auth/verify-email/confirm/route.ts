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
  const payload = await req.text();
  const res = await fetch(`${process.env.BACKEND_URL}/api/auth/verify-email/confirm/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    cache: "no-store",
  });

  const text = await res.text().catch(() => "");
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    const error =
      data?.detail ||
      data?.error ||
      (typeof data === "string" ? data : "") ||
      text ||
      "Verification failed";
    return NextResponse.json({ error }, { status: res.status });
  }

  const access = data?.access || data?.access_token || null;
  const refresh = data?.refresh || data?.refresh_token || null;

  const out = NextResponse.json({ ok: true }, { status: res.status });
  if (access) out.cookies.set(ACCESS, access, { ...cookieOptions, maxAge: 60 * 15 });
  if (refresh) out.cookies.set(REFRESH, refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
  return out;
}
