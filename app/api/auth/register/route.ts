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

// Simple passthrough to backend user creation endpoint
// Adjust the path if your backend differs
export async function POST(req: Request) {
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const payloadWithLanguage = {
    ...raw,
    preferred_language: normalizePreferredLanguage(raw.preferred_language),
  };

  const tryRegister = async (payload: Record<string, unknown>) =>
    fetch(`${getApiBaseUrl()}/api/auth/register/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

  let res = await tryRegister(payloadWithLanguage);
  if (!res.ok && res.status === 400) {
    // Backward compatibility when backend register serializer does not accept preferred_language.
    const { preferred_language: _ignored, ...withoutLanguage } = payloadWithLanguage;
    res = await tryRegister(withoutLanguage);
  }

  const text = await res.text().catch(() => "");
  const ct = res.headers.get("content-type") || "";

  // Success: try return parsed JSON, otherwise { ok: true }
  if (res.ok) {
    // Expect tokens from backend: { access, refresh }
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    const out = NextResponse.json({ ok: true }, { status: res.status });
    if (data?.access) out.cookies.set(ACCESS, data.access, { ...cookieOptions, maxAge: 60 * 15 });
    if (data?.refresh) out.cookies.set(REFRESH, data.refresh, { ...cookieOptions, maxAge: 60 * 60 * 24 * 7 });
    return out;
  }

  // Error: normalize to JSON { error }
  let message = "Registration failed";
  if (ct.includes("application/json")) {
    try {
      const err = JSON.parse(text);
      message = typeof err === "string" ? err : err.detail || err.error || JSON.stringify(err);
    } catch {
      message = text || message;
    }
  } else if (ct.includes("text/html")) {
    message = `${res.status} ${res.statusText || "Error"}`;
  } else {
    message = text || message;
  }

  return NextResponse.json({ error: message }, { status: res.status });
}




