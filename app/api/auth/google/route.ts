import { NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-base";
import { normalizePreferredLanguage } from "@/lib/language";

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
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payloadWithLanguage = {
    ...raw,
    preferred_language: normalizePreferredLanguage(raw.preferred_language),
  };

  const tryGoogleLogin = async (payload: Record<string, unknown>) =>
    fetch(`${getApiBaseUrl()}/api/auth/google/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

  let res = await tryGoogleLogin(payloadWithLanguage);
  if (!res.ok && res.status === 400) {
    // Backward compatibility when backend google serializer does not accept preferred_language.
    const { preferred_language: _ignored, ...withoutLanguage } = payloadWithLanguage;
    res = await tryGoogleLogin(withoutLanguage);
  }

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

  // Success -> set cookies with tokens
  const out = NextResponse.json({ ok: true }, { status: 200 });
  if (data?.access) out.cookies.set(ACCESS, data.access, { ...cookieOptions, maxAge: 60 * 15 });
  if (data?.refresh) out.cookies.set(REFRESH, data.refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
  return out;
}
