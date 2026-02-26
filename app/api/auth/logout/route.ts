import { NextResponse } from 'next/server';

const ACCESS = process.env.AUTH_ACCESS_COOKIE!;
const REFRESH = process.env.AUTH_REFRESH_COOKIE!;
const DOMAIN  = process.env.AUTH_COOKIE_DOMAIN;
const SECURE  = String(process.env.AUTH_COOKIE_SECURE) === 'true';

const cookieOptions = {
  path: '/',
  domain: DOMAIN,
  secure: SECURE,
  httpOnly: true,
  sameSite: 'lax' as const,
};

export async function POST(req: Request) {
  const out = NextResponse.redirect(new URL('/login', req.url));
  // Delete cookies using same attributes as when they were set
  out.cookies.set(ACCESS, "", { ...cookieOptions, maxAge: 0 });
  out.cookies.set(REFRESH, "", { ...cookieOptions, maxAge: 0 });
  return out;
}
