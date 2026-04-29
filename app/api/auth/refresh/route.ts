import { NextResponse } from 'next/server';
import { getApiBaseUrl } from '@/lib/api-base';
import { getRefreshToken } from '@/lib/cookies';

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

export async function POST() {
  const refresh = await getRefreshToken();
  if (!refresh) {
    const out = NextResponse.json({ error: 'No refresh token' }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const res = await fetch(`${getApiBaseUrl()}/api/auth/refresh/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const out = NextResponse.json({ error: 'Refresh failed' }, { status: 401 });
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }

  const tokens = await res.json(); // { access, refresh? }
  const out = NextResponse.json({ ok: true });
  out.cookies.set(ACCESS, tokens.access, { ...cookieOptions, maxAge: 60 * 15 });
  out.cookies.set(REFRESH, tokens.refresh ?? refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
  return out;
}
