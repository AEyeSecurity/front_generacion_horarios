import { NextResponse } from 'next/server';
import { normalizePreferredLanguage } from "@/lib/language";

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
  const raw = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    password?: unknown;
    preferred_language?: unknown;
  };
  const email = typeof raw.email === "string" ? raw.email : "";
  const password = typeof raw.password === "string" ? raw.password : "";
  const preferredLanguage = normalizePreferredLanguage(raw.preferred_language);

  const tryLogin = async (payload: Record<string, unknown>) =>
    fetch(`${process.env.BACKEND_URL}/api/auth/login/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

  let res = await tryLogin({ email, password, preferred_language: preferredLanguage });
  if (!res.ok && res.status === 400) {
    // Backward compatibility when backend login serializer does not accept preferred_language.
    res = await tryLogin({ email, password });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Invalid credentials');
    return NextResponse.json({ error: text }, { status: res.status || 401 });
  }

  const { access, refresh } = await res.json();

  const out = NextResponse.json({ ok: true });
  out.cookies.set(ACCESS,  access,  { ...cookieOptions, maxAge: 60 * 15 });          // 15 min
  out.cookies.set(REFRESH, refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 }); // 7 días
  return out;
}
