import { NextResponse } from 'next/server';

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN  = process.env.AUTH_COOKIE_DOMAIN;
const SECURE  = String(process.env.AUTH_COOKIE_SECURE) === 'true';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: SECURE,
  domain: DOMAIN,
  path: '/',
};

export async function POST(req: Request) {
  const { username, password } = await req.json();
  const res = await fetch(`${process.env.BACKEND_URL}/api/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => 'Invalid credentials');
    return NextResponse.json({ error: text }, { status: 401 });
  }

  const { access, refresh } = await res.json();

  const out = NextResponse.json({ ok: true });
  out.cookies.set(ACCESS,  access,  { ...cookieOptions, maxAge: 60 * 15 });          // 15 min
  out.cookies.set(REFRESH, refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 }); // 7 días
  return out;
}
